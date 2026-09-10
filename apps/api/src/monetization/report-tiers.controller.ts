import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ReportTierDto } from "./dto/monetization-response.dto";

/**
 * GET /v1/report-tiers — public pricing-page data. All four seeded
 * `ReportTier` rows, sorted by `sortOrder` (essential -> investor ->
 * professional -> premium). `premium` is marked `purchasable: false` — it's
 * real pricing-page data (REQUIREMENTS.md decision log #10), just not yet
 * buyable, since Decision 3's human-review queue subsystem doesn't exist.
 */
@Controller("report-tiers")
export class ReportTiersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<ReportTierDto[]> {
    const tiers = await this.prisma.reportTier.findMany({ orderBy: { sortOrder: "asc" } });
    return tiers.map((tier) => ({
      code: tier.code,
      displayName: tier.displayName,
      subscriberPriceCents: tier.subscriberPriceCents,
      nonSubscriberPriceCents: tier.nonSubscriberPriceCents,
      requiresHumanReview: tier.requiresHumanReview,
      sortOrder: tier.sortOrder,
      purchasable: !tier.requiresHumanReview,
    }));
  }
}
