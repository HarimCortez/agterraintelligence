import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CroplandDataClient } from "./cropland-data-client";

const SOURCE = "usda_nass_cropland_data_layer";

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
 * Real ingestion job: queries the USDA NASS Cropland Data Layer (via
 * Microsoft Planetary Computer — see `CroplandDataClient`'s doc comment
 * for why) for every property's coordinates and writes a real
 * `PropertyCropCover` row — the satellite-observed crop/land-cover
 * classification for the most recently published year at that point.
 * Same `run()`/`trigger()`/`executeRun()` shape as the other four
 * ingestion jobs.
 *
 * Swept across all properties, not scoped to a particular
 * `landUseType` (unlike the citrus quarantine job) — the whole point is
 * to let a reader compare the self-reported land use against what the
 * satellite record actually shows, which is exactly as useful for
 * catching a mismatch on a "row_crop" or "vacant_agricultural" listing
 * as on a citrus one.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has a `PropertyCropCover` row is skipped, not re-queried. CDL data is
 * revised infrequently and this is a "most recent available year"
 * snapshot, not a rolling multi-year history in this pass — re-running
 * to pick up a newly-published year is a deliberate later enhancement,
 * not silently done here.
 */
@Injectable()
export class CroplandCoverIngestionService {
  private readonly logger = new Logger(CroplandCoverIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly croplandClient: CroplandDataClient,
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
        `Background cropland cover ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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

      const existing = await this.prisma.propertyCropCover.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      let recordsCreated = 0;
      for (const property of properties) {
        if (propertiesAlreadyIngested.has(property.id)) continue;

        const result = await this.croplandClient.queryPointCropCover(property.lat, property.lng);
        if (!result) continue;

        await this.prisma.propertyCropCover.create({
          data: {
            propertyId: property.id,
            year: result.year,
            cropCode: result.cropCode,
            cropDescription: result.cropDescription,
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
      this.logger.error(`Cropland cover ingestion run ${ingestionRunId} failed: ${message}`);
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
