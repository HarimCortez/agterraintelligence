import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { NassAgCensusClient, normalizeCountyName } from "./nass-ag-census-client";

const SOURCE = "usda_nass_ag_census";
const CENSUS_YEAR = 2022;

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
 * Real ingestion job: attaches the property's own county's USDA NASS
 * Census of Agriculture figures (cattle inventory, average agricultural
 * land value per acre) — see `NassAgCensusClient`'s doc comment for how
 * this data source was verified live and why it's a batch bulk-file pull
 * rather than the live per-point/per-county REST queries every other
 * ingestion job in this module uses.
 *
 * Swept across all properties, not scoped to a land use type — both
 * tracked figures are relevant context regardless of what's listed on the
 * property (cattle inventory for pasture/mixed-agricultural, land value
 * for every land use as a rough county benchmark).
 *
 * Architecturally different from the other jobs in one deliberate way:
 * the client is called exactly ONCE per run (not once per property or
 * once per distinct county) — the bulk file already contains every
 * Florida county in a single ~300MB download, so fetching it repeatedly
 * would only be slower, never more accurate. Idempotent by design, same
 * as the other jobs: a property that already has this row is skipped.
 */
@Injectable()
export class NassAgCensusIngestionService {
  private readonly logger = new Logger(NassAgCensusIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly censusClient: NassAgCensusClient,
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
        `Background NASS ag census ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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

      const existing = await this.prisma.propertyAgCensusSummary.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      const propertiesNeedingData = properties.filter((p) => !propertiesAlreadyIngested.has(p.id));
      const countyResults =
        propertiesNeedingData.length > 0 ? await this.censusClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const property of propertiesNeedingData) {
        const result = countyResults.get(normalizeCountyName(property.county));
        if (
          !result ||
          (result.countyCattleInventoryHead === null &&
            result.countyAgLandValueCentsPerAcre === null &&
            result.countyIrrigatedAcres === null)
        ) {
          continue;
        }

        await this.prisma.propertyAgCensusSummary.create({
          data: {
            propertyId: property.id,
            year: CENSUS_YEAR,
            countyCattleInventoryHead: result.countyCattleInventoryHead,
            countyAgLandValueCentsPerAcre: result.countyAgLandValueCentsPerAcre,
            countyIrrigatedAcres: result.countyIrrigatedAcres,
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
      this.logger.error(`NASS ag census ingestion run ${ingestionRunId} failed: ${message}`);
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
