import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CitrusCankerClient } from "./citrus-canker-client";

const SOURCE = "usda_aphis_citrus_canker_quarantine";
const RISK_TYPE = "citrus_canker_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags citrus properties in counties currently
 * under active federal Citrus Canker quarantine — see
 * `CitrusCankerClient`'s doc comment for source verification. Same
 * run/trigger/executeRun shape and county-caching approach as
 * `CitrusQuarantineIngestionService` (HLB), scoped to
 * `landUseType: "citrus"` properties only for the same reason: a
 * pasture or row crop parcel isn't meaningfully affected by a citrus
 * disease quarantine.
 *
 * Severity `medium`, matching `CitrusQuarantineIngestionService`'s HLB
 * flag — both are now-endemic Florida citrus diseases managed rather
 * than actively eradicated (Citrus Canker's mandatory tree-destruction
 * program ended in 2006), not a one-off severity choice.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class CitrusCankerIngestionService {
  private readonly logger = new Logger(CitrusCankerIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cankerClient: CitrusCankerClient,
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
        `Background Citrus Canker ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const citrusProperties = await this.prisma.property.findMany({
        where: { landUseType: "citrus" },
        select: { id: true, county: true },
      });

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: citrusProperties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const countyStatusCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of citrusProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        if (!countyStatusCache.has(property.county)) {
          const result = await this.cankerClient.queryCountyStatus(property.county);
          countyStatusCache.set(property.county, result?.status ?? null);
        }
        const status = countyStatusCache.get(property.county);
        if (!status) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "medium",
            description: `${property.county} County is under a federal Citrus Canker quarantine (${status}), restricting movement of citrus nursery stock, budwood, and fruit. Citrus Canker is a bacterial disease affecting citrus groves throughout Florida — mandatory tree destruction ended in 2006 once the disease became too widespread to eradicate; the state now manages rather than eradicates it. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Citrus Canker ingestion run ${ingestionRunId} failed: ${message}`);
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
