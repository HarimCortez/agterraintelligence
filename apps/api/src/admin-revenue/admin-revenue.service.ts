import { Injectable } from "@nestjs/common";
import { ExternalRole } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { SUBSCRIPTION_PLANS_CATALOG } from "../monetization/subscription-plans.catalog";
import { RevenueTrendQuery } from "./dto/revenue-trend.query";
import { TopTransactionsQuery } from "./dto/top-transactions.query";
import {
  AdminRevenueSummaryDto,
  RevenueByPersonaRow,
  RevenueTrendResponseDto,
  TopTransactionsResponseDto,
} from "./dto/admin-revenue.dto";

const ALL_EXTERNAL_ROLES: ExternalRole[] = [
  "free",
  "basic_subscriber",
  "investor_subscriber",
  "professional_subscriber",
  "institutional",
  "team_admin",
  "team_member",
];

/**
 * Revenue Analytics (REQUIREMENTS.md Section C.8): revenue by report tier,
 * revenue by persona (external role), a daily trend, and a high-value-
 * transactions list. All aggregation happens in application code rather
 * than raw SQL (`date_trunc`, cross-table `GROUP BY`) — current data
 * volumes are small (a new product), and Prisma's typed query API is
 * simpler and safer than raw SQL for that volume; revisit if/when real
 * scale makes DB-side aggregation actually necessary.
 *
 * Deliberately NOT here (real follow-up scope, not faked):
 * - Cohort retention — needs multiple real time periods of signup/churn
 *   history to mean anything; with the product days old, there is no
 *   retention curve to show yet, real or otherwise.
 * - Geography — no billing/user geography is captured anywhere in the
 *   local data model (Stripe holds a customer's address, but it's never
 *   synced locally); this isn't a "later pass," it's a genuinely missing
 *   data source that would need new capture work first.
 */
@Injectable()
export class AdminRevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<AdminRevenueSummaryDto> {
    const [activeSubsByPlan, tierGroups, tiers, activeSubsWithRole, deliveredOrdersWithRole] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ["plan"], where: { status: "active" }, _count: { _all: true } }),
      this.prisma.reportOrder.groupBy({
        by: ["reportTierCode"],
        where: { status: "delivered" },
        _count: { _all: true },
        _sum: { pricePaidCents: true },
      }),
      this.prisma.reportTier.findMany({ select: { code: true, displayName: true } }),
      this.prisma.subscription.findMany({
        where: { status: "active" },
        select: { user: { select: { externalRole: true } } },
      }),
      this.prisma.reportOrder.findMany({
        where: { status: "delivered" },
        select: { pricePaidCents: true, user: { select: { externalRole: true } } },
      }),
    ]);

    let subscriptionMrrCents = 0;
    for (const row of activeSubsByPlan) {
      const catalogEntry = SUBSCRIPTION_PLANS_CATALOG.find((p) => p.plan === row.plan);
      subscriptionMrrCents += (catalogEntry?.priceCentsPerMonth ?? 0) * row._count._all;
    }

    const tierDisplayNames = new Map(tiers.map((t) => [t.code, t.displayName]));
    const revenueByTier = tierGroups.map((row) => ({
      reportTierCode: row.reportTierCode,
      displayName: tierDisplayNames.get(row.reportTierCode) ?? row.reportTierCode,
      orderCount: row._count._all,
      revenueCents: row._sum.pricePaidCents ?? 0,
    }));
    const reportRevenueCents = revenueByTier.reduce((sum, t) => sum + t.revenueCents, 0);

    const personaMap = new Map<ExternalRole, RevenueByPersonaRow>(
      ALL_EXTERNAL_ROLES.map((role) => [
        role,
        { externalRole: role, activeSubscriptionCount: 0, reportOrderCount: 0, reportRevenueCents: 0 },
      ]),
    );
    for (const sub of activeSubsWithRole) {
      personaMap.get(sub.user.externalRole)!.activeSubscriptionCount += 1;
    }
    for (const order of deliveredOrdersWithRole) {
      const row = personaMap.get(order.user.externalRole)!;
      row.reportOrderCount += 1;
      row.reportRevenueCents += order.pricePaidCents;
    }

    return {
      subscriptionMrrCents,
      reportRevenueCents,
      revenueByTier,
      revenueByPersona: Array.from(personaMap.values()),
    };
  }

  async getTrend(query: RevenueTrendQuery): Promise<RevenueTrendResponseDto> {
    const days = query.days ?? 30;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const [orders, subs] = await Promise.all([
      this.prisma.reportOrder.findMany({
        where: { status: "delivered", createdAt: { gte: since } },
        select: { createdAt: true, pricePaidCents: true },
      }),
      this.prisma.subscription.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const buckets = new Map<string, { reportRevenueCents: number; newSubscriptions: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      buckets.set(dayKey(d), { reportRevenueCents: 0, newSubscriptions: 0 });
    }
    for (const order of orders) {
      const bucket = buckets.get(dayKey(order.createdAt));
      if (bucket) bucket.reportRevenueCents += order.pricePaidCents;
    }
    for (const sub of subs) {
      const bucket = buckets.get(dayKey(sub.createdAt));
      if (bucket) bucket.newSubscriptions += 1;
    }

    return {
      points: Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v })),
    };
  }

  async getTopTransactions(query: TopTransactionsQuery): Promise<TopTransactionsResponseDto> {
    const limit = query.limit ?? 10;
    const rows = await this.prisma.reportOrder.findMany({
      where: { status: "delivered" },
      include: { user: { select: { email: true } }, property: { select: { address: true } } },
      orderBy: { pricePaidCents: "desc" },
      take: limit,
    });

    return {
      results: rows.map((row) => ({
        orderId: row.id,
        userEmail: row.user.email,
        propertyAddress: row.property.address,
        reportTierCode: row.reportTierCode,
        pricePaidCents: row.pricePaidCents,
        createdAt: row.createdAt,
      })),
    };
  }
}

/** UTC YYYY-MM-DD key for day-bucketing. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
