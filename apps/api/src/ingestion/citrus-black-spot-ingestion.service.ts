import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CitrusBlackSpotClient } from "./citrus-black-spot-client";

const SOURCE = "usda_aphis_citrus_black_spot";

interface CitrusPropertyRow {
  id: string;
  county: string;
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
 * Real ingestion job: flags citrus properties that fall inside a real,
 * active federal Citrus Black Spot quarantine polygon — see
 * `CitrusBlackSpotClient`'s doc comment for how this data source was
 * verified live, and for why it needs a genuine per-point spatial query
 * rather than the per-county lookup `CitrusQuarantineIngestionService`
 * (HLB) uses: Citrus Black Spot quarantine areas are real sub-county
 * polygons, not whole-county designations, so a county-level flag would
 * over-flag citrus properties nowhere near an actual quarantine zone.
 *
 * Scoped to `landUseType: "citrus"` properties only, same reasoning as the
 * HLB job — a pasture or row crop parcel isn't meaningfully affected by a
 * citrus fungal disease quarantine. Idempotent by design: a property that
 * already has this flag is skipped, not re-queried. This is a separate
 * risk flag (`citrus_black_spot_quarantine`) from HLB's
 * (`citrus_greening_quarantine`) — a citrus property can be in one, both,
 * or neither quarantine zone, and collapsing them into a single flag would
 * lose that real distinction.
 */
@Injectable()
export class CitrusBlackSpotIngestionService {
  private readonly logger = new Logger(CitrusBlackSpotIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blackSpotClient: CitrusBlackSpotClient,
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
        `Background citrus black spot ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const citrusProperties = await this.prisma.$queryRaw<CitrusPropertyRow[]>`
        SELECT id, county, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM properties
        WHERE land_use_type = 'citrus'
      `;

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: {
          propertyId: { in: citrusProperties.map((p) => p.id) },
          riskType: "citrus_black_spot_quarantine",
        },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      let recordsCreated = 0;
      for (const property of citrusProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        const result = await this.blackSpotClient.queryPoint(property.lat, property.lng);
        if (!result) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: "citrus_black_spot_quarantine",
            severity: "medium",
            description: `This property falls within a federal Citrus Black Spot quarantine area in ${property.county} County (${result.status}), restricting movement of citrus nursery stock, budwood, and fruit. Citrus Black Spot is a fungal disease that blemishes fruit and can affect marketability. Source: USDA APHIS Plant Protection and Quarantine.`,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: citrusProperties.length,
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
      this.logger.error(`Citrus black spot ingestion run ${ingestionRunId} failed: ${message}`);
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
