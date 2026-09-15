import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { EmeraldAshBorerClient } from "./emerald-ash-borer-client";

const SOURCE = "usda_aphis_emerald_ash_borer";
const RISK_TYPE = "emerald_ash_borer_known_infested";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags timber properties in counties with confirmed
 * Emerald Ash Borer infestation — see `EmeraldAshBorerClient`'s doc
 * comment for how this data source was verified live, including why it
 * currently finds nothing to flag for any of this project's Florida-only
 * seed properties (real coverage, real absence, not a broken query).
 *
 * Scoped to `landUseType: "timber"` properties only, same reasoning as
 * `SpongyMothQuarantineIngestionService`/
 * `AsianLonghornedBeetleQuarantineIngestionService`/
 * `SuddenOakDeathQuarantineIngestionService` — Emerald Ash Borer is a
 * forest pest whose known-infestation status is specifically relevant to
 * timber land value. Severity `medium`: EAB is lethal to unprotected ash
 * trees, but Florida's commercial timber is predominantly pine (slash/
 * loblolly), not ash-dominated hardwood, so the real economic impact on a
 * typical Florida timber stand is more limited than a hardwood-heavy
 * region would see — a deliberately lower severity than Asian Longhorned
 * Beetle/Sudden Oak Death's `high` (both of which threaten a broader host
 * range or have no cure at all), but above the purely informational `low`
 * tier.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class EmeraldAshBorerIngestionService {
  private readonly logger = new Logger(EmeraldAshBorerIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eabClient: EmeraldAshBorerClient,
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
        `Background Emerald Ash Borer ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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

      const countyResultCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of timberProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        if (!countyResultCache.has(property.county)) {
          const result = await this.eabClient.queryCountyStatus(property.county);
          countyResultCache.set(property.county, result?.firstConfirmedYear ?? null);
        }
        const firstConfirmedYear = countyResultCache.get(property.county);
        if (!firstConfirmedYear) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "medium",
            description: `${property.county} County has confirmed Emerald Ash Borer since ${firstConfirmedYear}. EAB is lethal to unprotected ash trees and has killed hundreds of millions of ash trees nationwide since 2002 — the federal EAB quarantine program ended in 2021 (management is now state-level), so this reflects known infestation, not an active movement restriction. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Emerald Ash Borer ingestion run ${ingestionRunId} failed: ${message}`);
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
