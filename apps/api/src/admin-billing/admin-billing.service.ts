import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SUBSCRIPTION_PLANS_CATALOG } from "../monetization/subscription-plans.catalog";
import { ListAdminSubscriptionsQuery } from "./dto/list-subscriptions.query";
import { ListAdminReportOrdersQuery } from "./dto/list-report-orders.query";
import {
  AdminBillingSummaryDto,
  ListAdminReportOrdersResponseDto,
  ListAdminSubscriptionsResponseDto,
} from "./dto/admin-billing.dto";

/**
 * Read-only admin billing/entitlements queries — REQUIREMENTS.md Section C.2
 * ("Billing, Subscriptions & Report Entitlements"). Deliberately scoped to
 * what's real, queryable data today: subscription/report-order listing and
 * a small KPI summary. NOT built here (real follow-up scope, not faked):
 * - Refunds — a real financial action; REQUIREMENTS.md's decision log
 *   explicitly flags this as needing a dedicated review-step design, not
 *   something to bolt onto a read-only billing screen.
 * - Promotions — no discount-code data model exists at all yet.
 * - Audit log — no audit-log table exists yet.
 * - Revenue trend/cohort analytics — would need real time-series behavior;
 *   today's data is a single seed snapshot, so a trend chart would be
 *   fabricated, not real.
 */
@Injectable()
export class AdminBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<AdminBillingSummaryDto> {
    const [subscriptionsByPlan, reportOrdersByStatus, deliveredRevenue, totalReportOrders] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ["plan"],
        where: { status: "active" },
        _count: { _all: true },
      }),
      this.prisma.reportOrder.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.reportOrder.aggregate({
        where: { status: "delivered" },
        _sum: { pricePaidCents: true },
      }),
      this.prisma.reportOrder.count(),
    ]);

    const activeSubscriptionsByPlan: Record<string, number> = {};
    let monthlyRecurringRevenueCents = 0;
    for (const row of subscriptionsByPlan) {
      activeSubscriptionsByPlan[row.plan] = row._count._all;
      const catalogEntry = SUBSCRIPTION_PLANS_CATALOG.find((p) => p.plan === row.plan);
      monthlyRecurringRevenueCents += (catalogEntry?.priceCentsPerMonth ?? 0) * row._count._all;
    }

    const reportOrdersByStatusMap: Record<string, number> = {};
    for (const row of reportOrdersByStatus) {
      reportOrdersByStatusMap[row.status] = row._count._all;
    }

    return {
      activeSubscriptionsByPlan,
      monthlyRecurringRevenueCents,
      totalReportOrders,
      reportOrdersByStatus: reportOrdersByStatusMap,
      totalReportRevenueCents: deliveredRevenue._sum.pricePaidCents ?? 0,
    };
  }

  async listSubscriptions(query: ListAdminSubscriptionsQuery): Promise<ListAdminSubscriptionsResponseDto> {
    const where = {
      ...(query.plan ? { plan: query.plan } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      results: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user.email,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        stripeCustomerId: row.stripeCustomerId,
        createdAt: row.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  async listReportOrders(query: ListAdminReportOrdersQuery): Promise<ListAdminReportOrdersResponseDto> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.reportTierCode ? { reportTierCode: query.reportTierCode } : {}),
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.reportOrder.findMany({
        where,
        include: { user: { select: { email: true } }, property: { select: { address: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.reportOrder.count({ where }),
    ]);

    return {
      results: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user.email,
        propertyId: row.propertyId,
        propertyAddress: row.property.address,
        reportTierCode: row.reportTierCode,
        pricePaidCents: row.pricePaidCents,
        priceBasis: row.priceBasis,
        upgradeCreditAppliedCents: row.upgradeCreditAppliedCents,
        status: row.status,
        createdAt: row.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }
}
