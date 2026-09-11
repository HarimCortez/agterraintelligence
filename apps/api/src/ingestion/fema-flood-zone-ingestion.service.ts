import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { FemaFloodZoneClient } from "./fema-flood-zone-client";

const SOURCE = "fema_flood_zones";

interface PropertyLocationRow {
  id: string;
  lat: number;
  lng: number;
}

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  propertiesChecked: number;
  flagsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: queries FEMA's National Flood Hazard Layer for every
 * property's coordinates and creates a real `property_risk_flags` row
 * (`riskType: "flood_zone"`) for any property FEMA reports as being in a
 * Special Flood Hazard Area. Manually triggered (admin action), not on a
 * schedule — there's no cron infrastructure in this deployment yet.
 *
 * Idempotent by design: a property that already has a `flood_zone` flag
 * (from a prior run, or from seed data) is left alone rather than
 * duplicated. Deliberately does NOT remove a `flood_zone` flag for a
 * property FEMA no longer reports as SFHA — that's a real product
 * decision (does a flag get auto-retracted, or does someone need to
 * review why the data changed?) this pass doesn't make unilaterally.
 * Per-property failures (a single bad FEMA response, a timeout) are
 * logged and skipped rather than aborting the whole run.
 *
 * A real end-to-end run against the local seed data (20 properties) took
 * ~35 seconds and tripped the Next.js dev rewrite proxy's own timeout
 * (~30s) before the HTTP response could return — disproving this file's
 * original assumption that a batch "completes well under the time a
 * synchronous admin HTTP request can reasonably wait on." `trigger()`
 * below is the fix: it starts a run and returns immediately rather than
 * blocking the request on the full external-API sweep.
 */
@Injectable()
export class FemaFloodZoneIngestionService {
  private readonly logger = new Logger(FemaFloodZoneIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly femaClient: FemaFloodZoneClient,
  ) {}

  /** Runs synchronously to completion. Used directly by tests; `trigger()` is the non-blocking entry point admin HTTP requests should use. */
  async run(): Promise<IngestionRunSummary> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    return this.executeRun(ingestionRun.id);
  }

  /**
   * Starts a run and returns its id immediately, without waiting for the
   * FEMA sweep to finish — the job continues in the background. Callers
   * (the admin trigger endpoint) should poll `GET /v1/admin/ingestion/runs`
   * to see it transition out of "running".
   */
  async trigger(): Promise<{ id: string }> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    void this.executeRun(ingestionRun.id).catch((error) => {
      this.logger.error(
        `Background FEMA flood zone ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
        where: { propertyId: { in: properties.map((p) => p.id) }, riskType: "flood_zone" },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      let flagsCreated = 0;
      for (const property of properties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        const result = await this.femaClient.queryPoint(property.lat, property.lng);
        if (!result?.isSpecialFloodHazardArea) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: "flood_zone",
            severity: "high",
            description: `Property is located within a FEMA-designated Special Flood Hazard Area (flood zone ${result.zone}${
              result.zoneSubType ? `, ${result.zoneSubType}` : ""
            }). Source: FEMA National Flood Hazard Layer.`,
          },
        });
        flagsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          propertiesChecked: properties.length,
          flagsCreated,
        },
      });

      return {
        id: updated.id,
        status: "succeeded",
        propertiesChecked: updated.propertiesChecked,
        flagsCreated: updated.flagsCreated,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`FEMA flood zone ingestion run ${ingestionRunId} failed: ${message}`);
      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: { status: "failed", finishedAt: new Date(), errorMessage: message },
      });
      return {
        id: updated.id,
        status: "failed",
        propertiesChecked: updated.propertiesChecked,
        flagsCreated: updated.flagsCreated,
        errorMessage: message,
      };
    }
  }
}
