import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AsianLonghornedBeetleQuarantineClient } from "./asian-longhorned-beetle-quarantine-client";

const SOURCE = "usda_aphis_asian_longhorned_beetle_quarantine";
const RISK_TYPE = "asian_longhorned_beetle_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags timber properties in counties currently under
 * active federal Asian Longhorned Beetle quarantine — see
 * `AsianLonghornedBeetleQuarantineClient`'s doc comment for how this data
 * source was verified live, including a real fix (server-side
 * `Quarantine_Status` filtering) that the other three quarantine jobs in
 * this module don't have, and why it currently finds nothing to flag for
 * any of this project's Florida-only seed properties (real coverage, real
 * absence, not a broken query).
 *
 * Scoped to `landUseType: "timber"` properties only, same reasoning as
 * `SpongyMothQuarantineIngestionService` — Asian Longhorned Beetle is a
 * hardwood tree pest whose quarantine (movement of firewood, green lumber,
 * nursery stock, and other regulated articles) is specifically relevant to
 * timber land value. Severity `high`, deliberately a step above Spongy
 * Moth's `medium`: an ALB detection typically triggers destruction of
 * every host tree in the infested area (not just quarantine restrictions),
 * a materially more severe real-world consequence for a timber property's
 * value than a movement restriction alone.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class AsianLonghornedBeetleQuarantineIngestionService {
  private readonly logger = new Logger(AsianLonghornedBeetleQuarantineIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quarantineClient: AsianLonghornedBeetleQuarantineClient,
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
        `Background Asian Longhorned Beetle quarantine ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
            description: `${property.county} County is under a federal Asian Longhorned Beetle quarantine (${status}), restricting movement of firewood, green lumber, nursery stock, and similar regulated articles. Asian Longhorned Beetle is a high-consequence hardwood pest — detections typically trigger removal of every host tree in the infested area, not just movement restrictions. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Asian Longhorned Beetle quarantine ingestion run ${ingestionRunId} failed: ${message}`);
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
