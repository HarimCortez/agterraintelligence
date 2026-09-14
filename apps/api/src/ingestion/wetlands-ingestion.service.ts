import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { WetlandsClient } from "./wetlands-client";

const SOURCE = "usfws_wetlands";

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
 * Real ingestion job: queries the "FWS Florida Wetlands" service (a
 * working alternative to the broken federal NWI service — see
 * `WetlandsClient`'s doc comment) for every property's coordinates and
 * creates a real `property_risk_flags` row (`riskType: "wetlands"`) for
 * any property that intersects a mapped wetland. Same shape as
 * `FemaFloodZoneIngestionService`, this project's established pattern for
 * a point-query risk-flag sweep over the (small, ~20-row) `properties`
 * table.
 *
 * Idempotent by design, same as the FEMA job: a property that already has
 * a `wetlands` flag is left alone rather than re-queried/duplicated.
 * Deliberately does not remove a `wetlands` flag the service no longer
 * reports — same reasoning as FEMA's doc comment: whether a flag should
 * auto-retract on a data change is a real product decision this pass
 * doesn't make unilaterally.
 *
 * Severity is `medium`, not `high` like the flood-zone flag: a wetland
 * designation constrains development/drainage (Clean Water Act Section
 * 404 permitting) but isn't an active hazard the way a Special Flood
 * Hazard Area is — a judgment call in the same severity vocabulary
 * already used elsewhere in the seed data, not a new business rule
 * requiring product sign-off.
 */
@Injectable()
export class WetlandsIngestionService {
  private readonly logger = new Logger(WetlandsIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wetlandsClient: WetlandsClient,
  ) {}

  /** Runs synchronously to completion. Used directly by tests; `trigger()` is the non-blocking entry point admin HTTP requests should use. */
  async run(): Promise<IngestionRunSummary> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    return this.executeRun(ingestionRun.id);
  }

  /** Starts a run and returns its id immediately, without waiting for the sweep to finish — see FEMA job's doc comment for why (the dev proxy timeout discovery applies equally here). */
  async trigger(): Promise<{ id: string }> {
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { source: SOURCE, status: "running" },
    });
    void this.executeRun(ingestionRun.id).catch((error) => {
      this.logger.error(
        `Background wetlands ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
        where: { propertyId: { in: properties.map((p) => p.id) }, riskType: "wetlands" },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      let recordsCreated = 0;
      for (const property of properties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        const result = await this.wetlandsClient.queryPoint(property.lat, property.lng);
        if (!result) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: "wetlands",
            severity: "medium",
            description: `Property intersects a mapped wetland (${result.wetlandType}, NWI code ${result.attribute}). Development, drainage, or land-clearing here may require Clean Water Act Section 404 permitting. Source: U.S. Fish & Wildlife Service National Wetlands Inventory.`,
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
      this.logger.error(`Wetlands ingestion run ${ingestionRunId} failed: ${message}`);
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
