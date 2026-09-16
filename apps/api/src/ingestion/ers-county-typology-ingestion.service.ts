import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsCountyTypologyClient } from "./ers-county-typology-client";
import { normalizeCountyName } from "./ers-county-economic-client";

const SOURCE = "usda_ers_county_typology";

interface PropertyCountySummaryRow {
  propertyId: string;
  county: string;
}

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: attaches the property's own county's USDA ERS
 * County Typology Codes + Natural Amenities Scale to the existing
 * `PropertyCountyEconomicSummary` row — see `ErsCountyTypologyClient`'s
 * doc comment for source verification.
 *
 * Unlike `ErsCountyEconomicIngestionService` (job 11), which creates the
 * summary row, this job only *updates* an existing one — it requires
 * `ErsCountyEconomicIngestionService` to have already run for a
 * property (that job sweeps every property regardless of land use, the
 * same scope this job needs). A property with no summary row yet is
 * skipped rather than partially created with the required `*Year`
 * fields left undefined; this mirrors how `countyRuralUrbanContinuumCode`
 * was added as a later field on an already-running job rather than a
 * job of its own, except here the two real data sources live on
 * different hosts entirely, which is why this one *is* a separate job.
 *
 * Swept across all properties with an existing summary row, not scoped
 * to a land use type — same reasoning as `ErsCountyEconomicIngestionService`.
 * Same "one client call per run" shape as that job: the classification
 * table already contains every Florida county in a single query, so the
 * client is called exactly once per run (only when at least one property
 * still needs it), never once per property or per county.
 *
 * Idempotent by design: a summary row where `countyFarmingDependent` is
 * already non-null (set only by this job) is treated as already
 * ingested and skipped — distinct from the shared population/income
 * fields job 11 also writes to the same row.
 */
@Injectable()
export class ErsCountyTypologyIngestionService {
  private readonly logger = new Logger(ErsCountyTypologyIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typologyClient: ErsCountyTypologyClient,
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
        `Background ERS county typology ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const summaryRows = await this.prisma.$queryRaw<PropertyCountySummaryRow[]>`
        SELECT pces.property_id AS "propertyId", p.county AS county
        FROM property_county_economic_summary pces
        JOIN properties p ON p.id = pces.property_id
        WHERE pces.county_farming_dependent IS NULL
      `;

      const countyResults =
        summaryRows.length > 0 ? await this.typologyClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const row of summaryRows) {
        const result = countyResults.get(normalizeCountyName(row.county));
        if (!result) continue;

        await this.prisma.propertyCountyEconomicSummary.update({
          where: { propertyId: row.propertyId },
          data: {
            countyFarmingDependent: result.countyFarmingDependent,
            countyHighNaturalAmenities: result.countyHighNaturalAmenities,
            countyRetirementDestination: result.countyRetirementDestination,
            countyPopulationLoss: result.countyPopulationLoss,
            countyLowEducation: result.countyLowEducation,
            countyLowEmployment: result.countyLowEmployment,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: summaryRows.length,
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
      this.logger.error(`ERS county typology ingestion run ${ingestionRunId} failed: ${message}`);
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
