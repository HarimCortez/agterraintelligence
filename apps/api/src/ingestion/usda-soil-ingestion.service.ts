import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { UsdaSoilClient } from "./usda-soil-client";

const SOURCE = "usda_soil_data";

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
 * Real ingestion job: queries USDA NRCS Soil Data Access (SSURGO) for every
 * property's coordinates and writes a real `PropertySoilData` row per
 * property — see `UsdaSoilClient`'s doc comment for how that service was
 * verified live. Same `run()`/`trigger()`/`executeRun()` shape as
 * `FemaFloodZoneIngestionService` and `FlParcelCadastralIngestionService`
 * for consistency, though at only ~20 seeded properties this job finishes
 * in a few seconds — `trigger()` exists for interface consistency with the
 * admin ingestion module, not because this one actually needs the
 * background-run workaround FEMA's doc comment describes.
 *
 * Idempotent by design, same as the other two ingestion jobs: a property
 * that already has a `PropertySoilData` row is skipped, not re-queried —
 * soil survey data changes on a multi-year cycle, not day to day, so
 * there's no meaningful "refresh" case this pass needs to handle.
 */
@Injectable()
export class UsdaSoilIngestionService {
  private readonly logger = new Logger(UsdaSoilIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usdaSoilClient: UsdaSoilClient,
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
        `Background USDA soil ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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

      const existing = await this.prisma.propertySoilData.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      let recordsCreated = 0;
      for (const property of properties) {
        if (propertiesAlreadyIngested.has(property.id)) continue;

        const result = await this.usdaSoilClient.querySoilAtPoint(property.lat, property.lng);
        if (!result) continue;

        await this.prisma.propertySoilData.create({
          data: {
            propertyId: property.id,
            mapUnitKey: result.mapUnitKey,
            mapUnitSymbol: result.mapUnitSymbol,
            mapUnitName: result.mapUnitName,
            drainageClass: result.drainageClass,
            floodFrequency: result.floodFrequency,
            slopePercent: result.slopePercent,
            capabilityClass: result.capabilityClass,
            hydricPct: result.hydricPct,
            farmlandClassification: result.farmlandClassification,
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
      this.logger.error(`USDA soil ingestion run ${ingestionRunId} failed: ${message}`);
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
