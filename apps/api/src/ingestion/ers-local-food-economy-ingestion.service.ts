import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsLocalFoodEconomyClient, LOCAL_FOOD_ECONOMY_YEAR } from "./ers-local-food-economy-client";
import { normalizeCountyName } from "./ers-county-economic-client";

const SOURCE = "usda_ers_local_food_economy";

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
 * local food economy figures (orchard/berry acreage, direct farm
 * sales, agritourism) to the existing `PropertyAgCensusSummary` row —
 * see `ErsLocalFoodEconomyClient`'s doc comment for source
 * verification.
 *
 * Requires `NassAgCensusIngestionService` (job 8) to have already run
 * for a property — updates that job's existing summary row rather than
 * creating one, the same "extend an existing row" shape as
 * `ErsCountyTypologyIngestionService`/`ErsPovertyIncomeIngestionService`,
 * but on `PropertyAgCensusSummary` rather than
 * `PropertyCountyEconomicSummary` — this data is genuinely agricultural
 * (Census of Agriculture-derived), not general county economics, so it
 * belongs on the ag census table.
 *
 * Swept across all properties, not scoped to a land use type — same
 * reasoning as `NassAgCensusIngestionService`: county-wide agricultural
 * background context relevant regardless of what's listed on the
 * property. One client call per run. Idempotent by design: a summary
 * row where `localFoodEconomyYear` is already set (only by this job) is
 * treated as already ingested and skipped.
 */
@Injectable()
export class ErsLocalFoodEconomyIngestionService {
  private readonly logger = new Logger(ErsLocalFoodEconomyIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly localFoodEconomyClient: ErsLocalFoodEconomyClient,
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
        `Background ERS local food economy ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const summaryRows = await this.prisma.$queryRaw<PropertyCountySummaryRow[]>`
        SELECT pacs.property_id AS "propertyId", p.county AS county
        FROM property_ag_census_summary pacs
        JOIN properties p ON p.id = pacs.property_id
        WHERE pacs.local_food_economy_year IS NULL
      `;

      const countyResults =
        summaryRows.length > 0 ? await this.localFoodEconomyClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const row of summaryRows) {
        const result = countyResults.get(normalizeCountyName(row.county));
        if (!result) continue;

        await this.prisma.propertyAgCensusSummary.update({
          where: { propertyId: row.propertyId },
          data: {
            localFoodEconomyYear: LOCAL_FOOD_ECONOMY_YEAR,
            countyOrchardAcres: result.countyOrchardAcres,
            countyBerryAcres: result.countyBerryAcres,
            countyDirectFarmSalesPct: result.countyDirectFarmSalesPct,
            countyAgritourismOperations: result.countyAgritourismOperations,
            countyAgritourismReceiptsCents: result.countyAgritourismReceiptsCents,
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
      this.logger.error(`ERS local food economy ingestion run ${ingestionRunId} failed: ${message}`);
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
