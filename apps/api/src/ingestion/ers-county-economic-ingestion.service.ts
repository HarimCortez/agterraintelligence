import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsCountyEconomicClient, normalizeCountyName } from "./ers-county-economic-client";

const SOURCE = "usda_ers_county_economic";

interface PropertyCountyRow {
  id: string;
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
 * population growth and local economic figures — see
 * `ErsCountyEconomicClient`'s doc comment for how this data source was
 * verified live.
 *
 * Swept across all properties, not scoped to a land use type — like
 * `NassAgCensusIngestionService` and `RmaCauseOfLossIngestionService`, this
 * is county-wide background context relevant regardless of what's listed
 * on the property.
 *
 * Same "one client call per run" shape as those two jobs: both ERS files
 * already contain every Florida county in a single download each, so the
 * client is called exactly once (only when at least one property still
 * needs data), never once per property or per county. Idempotent by
 * design: a property that already has this row is skipped.
 */
@Injectable()
export class ErsCountyEconomicIngestionService {
  private readonly logger = new Logger(ErsCountyEconomicIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly economicClient: ErsCountyEconomicClient,
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
        `Background ERS county economic ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const properties = await this.prisma.$queryRaw<PropertyCountyRow[]>`
        SELECT id, county FROM properties
      `;

      const existing = await this.prisma.propertyCountyEconomicSummary.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      const propertiesNeedingData = properties.filter((p) => !propertiesAlreadyIngested.has(p.id));
      const countyResults =
        propertiesNeedingData.length > 0 ? await this.economicClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const property of propertiesNeedingData) {
        const result = countyResults.get(normalizeCountyName(property.county));
        if (
          !result ||
          (result.countyPopulation === null &&
            result.countyNetMigration === null &&
            result.countyRuralUrbanContinuumCode === null &&
            result.countyUnemploymentRatePct === null &&
            result.countyMedianHouseholdIncomeCents === null)
        ) {
          continue;
        }

        await this.prisma.propertyCountyEconomicSummary.create({
          data: {
            propertyId: property.id,
            populationYear: result.populationYear,
            countyPopulation: result.countyPopulation,
            countyNetMigration: result.countyNetMigration,
            countyRuralUrbanContinuumCode: result.countyRuralUrbanContinuumCode,
            unemploymentYear: result.unemploymentYear,
            countyUnemploymentRatePct: result.countyUnemploymentRatePct,
            incomeYear: result.incomeYear,
            countyMedianHouseholdIncomeCents: result.countyMedianHouseholdIncomeCents,
          },
        });
        recordsCreated++;
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
      this.logger.error(`ERS county economic ingestion run ${ingestionRunId} failed: ${message}`);
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
