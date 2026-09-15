import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { RdEligibilityCategory, UsdaRdEligibilityClient } from "./usda-rd-eligibility-client";

const SOURCE = "usda_rd_eligibility";

// Deliberately spelled out, not abbreviated ("usda"/"rd") — every other
// risk_type in this project (`flood_zone`, `wetland_overlap`,
// `citrus_greening_quarantine`, ...) is plain words with no acronyms,
// because `formatRiskType` (apps/investor-web/src/lib/formatters.ts)
// title-cases only the first word and sentence-cases the rest, which
// mangles a mid-string acronym into "Usda rd ineligible housing" — caught
// live in the browser during verification, not assumed.
const RISK_TYPE_BY_CATEGORY: Record<RdEligibilityCategory, string> = {
  housing: "rural_development_ineligible_housing",
  business: "rural_development_ineligible_business",
  community_facilities: "rural_development_ineligible_community_facilities",
};

const DESCRIPTION_BY_CATEGORY: Record<RdEligibilityCategory, string> = {
  housing:
    "This property sits within a USDA-designated urbanized area for USDA Rural Development Single Family/Multi-Family Housing loan purposes, making it ineligible for that program at this location. Source: USDA Rural Development Eligibility MapServer.",
  business:
    "This property sits within a USDA-designated urbanized area for USDA Rural Development Business (RBS) loan purposes, making it ineligible for that program at this location. Source: USDA Rural Development Eligibility MapServer.",
  community_facilities:
    "This property sits within a USDA-designated urbanized area for USDA Rural Development Community Facilities loan purposes, making it ineligible for that program at this location. Source: USDA Rural Development Eligibility MapServer.",
};

const ALL_TRACKED_RISK_TYPES = Object.values(RISK_TYPE_BY_CATEGORY);

interface PropertyLocationRow {
  id: string;
  lat: number;
  lng: number;
}

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: queries the USDA Rural Development Eligibility
 * MapServer for every property's coordinates and creates a real
 * `property_risk_flags` row for each tracked RD loan program (housing,
 * business, community facilities) the property is ineligible for at that
 * location — see `UsdaRdEligibilityClient`'s doc comment for how this
 * source was verified live, including the real variance found across this
 * project's seeded properties (unlike a separately-researched NRCS
 * Farmland Classification field that showed no variance and wasn't
 * pursued).
 *
 * Swept across all properties, not scoped to a land use type — RD loan
 * program eligibility is a financing-context fact relevant regardless of
 * what's listed on the property. Severity `low`: this isn't a physical or
 * environmental risk to the land itself, it's informational financing
 * context, unlike `flood_zone` (`high`) or the citrus quarantine flags
 * (`medium`).
 *
 * A single property can be ineligible for zero, one, two, or all three
 * tracked programs independently (confirmed live: none of the 20 seeded
 * properties hit more than one category), so each category gets its own
 * risk-flag row rather than one combined flag — same reasoning as keeping
 * `citrus_black_spot_quarantine` separate from `citrus_greening_quarantine`.
 *
 * Idempotency follows the same convention as `FemaFloodZoneIngestionService`:
 * a property already holding a given category's flag is skipped for that
 * category, but a fully-eligible property (zero flags) is re-queried on
 * every run, since "never checked" and "checked, fully eligible" are both
 * zero rows and can't be distinguished from `property_risk_flags` alone —
 * an accepted, pre-existing tradeoff in this module, not a new one.
 */
@Injectable()
export class UsdaRdEligibilityIngestionService {
  private readonly logger = new Logger(UsdaRdEligibilityIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibilityClient: UsdaRdEligibilityClient,
  ) {}

  async run(): Promise<IngestionRunSummary> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    return this.executeRun(ingestionRun.id);
  }

  async trigger(): Promise<{ id: string }> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    void this.executeRun(ingestionRun.id).catch((error) => {
      this.logger.error(
        `Background USDA RD eligibility ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const properties = await this.prisma.$queryRaw<PropertyLocationRow[]>`
        SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM properties
      `;

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) }, riskType: { in: ALL_TRACKED_RISK_TYPES } },
        select: { propertyId: true, riskType: true },
      });
      const flaggedCategoriesByProperty = new Map<string, Set<string>>();
      for (const flag of existingFlags) {
        const set = flaggedCategoriesByProperty.get(flag.propertyId) ?? new Set<string>();
        set.add(flag.riskType);
        flaggedCategoriesByProperty.set(flag.propertyId, set);
      }

      let recordsCreated = 0;
      for (const property of properties) {
        const alreadyFlagged = flaggedCategoriesByProperty.get(property.id) ?? new Set<string>();
        if (ALL_TRACKED_RISK_TYPES.every((riskType) => alreadyFlagged.has(riskType))) continue;

        const ineligibleCategories = await this.eligibilityClient.queryPoint(property.lat, property.lng);
        for (const category of ineligibleCategories) {
          const riskType = RISK_TYPE_BY_CATEGORY[category];
          if (alreadyFlagged.has(riskType)) continue;

          await this.prisma.propertyRiskFlag.create({
            data: {
              propertyId: property.id,
              riskType,
              severity: "low",
              description: DESCRIPTION_BY_CATEGORY[category],
            },
          });
          recordsCreated++;
        }
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: properties.length,
          recordsCreated,
        },
      });

      return {
        id: updated.id,
        status: "succeeded",
        itemsProcessed: updated.itemsProcessed,
        recordsCreated: updated.recordsCreated,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`USDA RD eligibility ingestion run ${ingestionRunId} failed: ${message}`);
      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: { status: "failed", finishedAt: new Date(), errorMessage: message },
      });
      return {
        id: updated.id,
        status: "failed",
        itemsProcessed: updated.itemsProcessed,
        recordsCreated: updated.recordsCreated,
        errorMessage: message,
      };
    }
  }
}
