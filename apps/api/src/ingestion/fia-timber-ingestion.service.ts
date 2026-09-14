import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { FIA_EVAL_YEAR, FiaTimberClient, normalizeCountyName } from "./fia-timber-client";

const SOURCE = "usda_fs_fia_timber";

interface TimberPropertyRow {
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
 * Real ingestion job: attaches the property's own county's USDA Forest
 * Service Forest Inventory and Analysis (FIA) timber figures — see
 * `FiaTimberClient`'s doc comment for how this data source was verified
 * live.
 *
 * Scoped to `landUseType: "timber"` properties only, same reasoning as
 * `CitrusQuarantineIngestionService` — county timber volume isn't
 * meaningfully relevant context for a citrus or row-crop parcel, so
 * attaching it there would be real data on an irrelevant property, not
 * useful signal. Contrast with `NassAgCensusIngestionService`, which
 * sweeps every property because land value and cattle inventory are
 * relevant regardless of land use; this job deliberately does not.
 *
 * Same "one client call serves every county" shape as the ag census job:
 * the FIADB-API returns every Florida county's estimate in a single
 * response, so the client is called exactly once per run (only when at
 * least one timber property still needs data), not once per property.
 * Idempotent by design: a property that already has this row is skipped.
 */
@Injectable()
export class FiaTimberIngestionService {
  private readonly logger = new Logger(FiaTimberIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timberClient: FiaTimberClient,
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
        `Background FIA timber ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const timberProperties = await this.prisma.$queryRaw<TimberPropertyRow[]>`
        SELECT id, county FROM properties WHERE land_use_type = 'timber'
      `;

      const existing = await this.prisma.propertyTimberSummary.findMany({
        where: { propertyId: { in: timberProperties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      const propertiesNeedingData = timberProperties.filter((p) => !propertiesAlreadyIngested.has(p.id));
      const countyResults =
        propertiesNeedingData.length > 0 ? await this.timberClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const property of propertiesNeedingData) {
        const result = countyResults.get(normalizeCountyName(property.county));
        if (
          !result ||
          (result.countyTimberlandAcres === null && result.countyTimberVolumeCuFtPerAcre === null)
        ) {
          continue;
        }

        await this.prisma.propertyTimberSummary.create({
          data: {
            propertyId: property.id,
            year: FIA_EVAL_YEAR,
            countyTimberlandAcres: result.countyTimberlandAcres,
            countyTimberVolumeCuFtPerAcre: result.countyTimberVolumeCuFtPerAcre,
            countyTimberVolumeSamplingErrorPct: result.countyTimberVolumeSamplingErrorPct,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: timberProperties.length,
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
      this.logger.error(`FIA timber ingestion run ${ingestionRunId} failed: ${message}`);
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
