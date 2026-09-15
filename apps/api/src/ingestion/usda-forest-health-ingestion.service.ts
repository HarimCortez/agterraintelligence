import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ForestHealthDetection, UsdaForestHealthClient } from "./usda-forest-health-client";

const SOURCE = "usda_forest_health";
const RISK_TYPE = "forest_pest_disease_detection";

interface TimberPropertyRow {
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

function describeDetections(county: string, detections: ForestHealthDetection[]): string {
  const items = detections
    .map((d) => `${d.causalAgent} (${d.damageType}, host: ${d.host}, ${d.surveyYear})`)
    .join("; ");
  return `Real USDA Forest Service aerial detection survey recorded forest pest/disease damage within approximately 10 miles of this property in ${county} County: ${items}. Detections are aerial-survey points, not a per-parcel assessment — proximity, not a claim about this exact parcel. Source: USDA Forest Service Insect & Disease Survey (IDS).`;
}

/**
 * Real ingestion job: queries the USDA Forest Service Insect & Disease
 * Survey for every timber property's coordinates and creates a single real
 * `property_risk_flags` row (`riskType: "forest_pest_disease_detection"`)
 * summarizing any real aerial-detected forest pest/disease damage found
 * within `SEARCH_RADIUS_MILES` — see `UsdaForestHealthClient`'s doc comment
 * for how this source was verified live, including why a radius query
 * (not exact point-intersects) is the only geometrically honest approach
 * for this point-detection dataset.
 *
 * Scoped to `landUseType: "timber"` properties only, same reasoning as
 * `CitrusBlackSpotIngestionService`/`CitrusQuarantineIngestionService` for
 * citrus — forest pest/disease risk is specifically relevant to timber
 * value, not every agricultural land use. Severity `low`: the data is a
 * proximity signal (up to ~10 miles away), not a confirmed on-parcel
 * condition, so it's deliberately not treated as a `high`/`medium`
 * physical risk the way `flood_zone` or the citrus quarantine flags are.
 *
 * Idempotent by design, same convention as the other risk-flag jobs: a
 * timber property that already has this flag is skipped, not re-queried.
 */
@Injectable()
export class UsdaForestHealthIngestionService {
  private readonly logger = new Logger(UsdaForestHealthIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forestHealthClient: UsdaForestHealthClient,
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
        `Background USDA Forest Health ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const timberProperties = await this.prisma.$queryRaw<TimberPropertyRow[]>`
        SELECT id, county, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM properties
        WHERE land_use_type = 'timber'
      `;

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: timberProperties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      let recordsCreated = 0;
      for (const property of timberProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        const detections = await this.forestHealthClient.queryNearby(property.lat, property.lng);
        if (detections.length === 0) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "low",
            description: describeDetections(property.county, detections),
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
      this.logger.error(`USDA Forest Health ingestion run ${ingestionRunId} failed: ${message}`);
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
