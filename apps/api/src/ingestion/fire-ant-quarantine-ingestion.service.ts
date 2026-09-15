import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { FireAntQuarantineClient } from "./fire-ant-quarantine-client";

const SOURCE = "usda_aphis_fire_ant_quarantine";
const RISK_TYPE = "imported_fire_ant_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags properties in counties currently under active
 * federal Imported Fire Ant quarantine — see `FireAntQuarantineClient`'s
 * doc comment for how this data source was verified live.
 *
 * Swept across ALL properties, not scoped to one `landUseType` like the
 * citrus quarantine jobs — Imported Fire Ant restricts movement of soil,
 * sod, hay, and nursery stock, and affects pasture/row crop/mixed ag land
 * as directly as citrus groves, unlike a citrus-specific disease
 * quarantine. Same run/trigger/executeRun shape and per-distinct-county
 * caching as `CitrusQuarantineIngestionService` (the underlying quarantine
 * data is itself county-granular, confirmed live — see the client's doc
 * comment — so a per-point geometry query would be slower for no extra
 * accuracy).
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class FireAntQuarantineIngestionService {
  private readonly logger = new Logger(FireAntQuarantineIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quarantineClient: FireAntQuarantineClient,
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
        `Background fire ant quarantine ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const properties = await this.prisma.property.findMany({
        select: { id: true, county: true },
      });

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const countyStatusCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of properties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        if (!countyStatusCache.has(property.county)) {
          const result = await this.quarantineClient.queryCountyStatus(property.county);
          countyStatusCache.set(property.county, result?.status ?? null);
        }
        const status = countyStatusCache.get(property.county);
        if (!status) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "low",
            description: `${property.county} County is under a federal Imported Fire Ant quarantine (${status}), restricting movement of soil, sod, hay, nursery stock, and similar regulated articles capable of spreading the pest. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Fire ant quarantine ingestion run ${ingestionRunId} failed: ${message}`);
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
