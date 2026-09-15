import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SuddenOakDeathQuarantineClient } from "./sudden-oak-death-quarantine-client";

const SOURCE = "usda_aphis_sudden_oak_death_quarantine";
const RISK_TYPE = "sudden_oak_death_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags timber properties in counties currently under
 * active federal Phytophthora ramorum (Sudden Oak Death) quarantine — see
 * `SuddenOakDeathQuarantineClient`'s doc comment for how this data source
 * was verified live, including why it currently finds nothing to flag for
 * any of this project's Florida-only seed properties (real coverage, real
 * absence, not a broken query).
 *
 * Scoped to `landUseType: "timber"` properties only, same reasoning as
 * `SpongyMothQuarantineIngestionService`/
 * `AsianLonghornedBeetleQuarantineIngestionService` — Sudden Oak Death is a
 * forest pathogen whose quarantine (movement of nursery stock, firewood,
 * and other regulated host material) is specifically relevant to timber
 * land value. Severity `high`, same tier as Asian Longhorned Beetle: the
 * disease is lethal to host oak and tanoak species and has no cure once
 * established in a stand, a materially severe real-world consequence for
 * timber value, not merely a movement restriction.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class SuddenOakDeathQuarantineIngestionService {
  private readonly logger = new Logger(SuddenOakDeathQuarantineIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quarantineClient: SuddenOakDeathQuarantineClient,
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
        `Background Sudden Oak Death quarantine ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const timberProperties = await this.prisma.property.findMany({
        where: { landUseType: "timber" },
        select: { id: true, county: true },
      });

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: timberProperties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const countyStatusCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of timberProperties) {
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
            severity: "high",
            description: `${property.county} County is under a federal Phytophthora ramorum (Sudden Oak Death) quarantine (${status}), restricting movement of nursery stock, firewood, and other regulated host material. Sudden Oak Death is lethal to host oak and tanoak species with no known cure once established in a stand. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Sudden Oak Death quarantine ingestion run ${ingestionRunId} failed: ${message}`);
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
