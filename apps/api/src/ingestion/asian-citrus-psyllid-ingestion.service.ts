import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AsianCitrusPsyllidClient } from "./asian-citrus-psyllid-client";

const SOURCE = "usda_aphis_asian_citrus_psyllid_quarantine";
const RISK_TYPE = "asian_citrus_psyllid_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags citrus properties in counties currently
 * under active federal Asian Citrus Psyllid quarantine — see
 * `AsianCitrusPsyllidClient`'s doc comment for source verification and
 * why this is a distinct, real concern from the Citrus Greening (HLB)
 * quarantine it's the vector for. Same run/trigger/executeRun shape and
 * county-caching approach as `CitrusCankerIngestionService`, scoped to
 * `landUseType: "citrus"` properties only for the same reason.
 *
 * Severity `medium`, matching the other Florida citrus quarantine flags
 * (HLB, Citrus Black Spot, Citrus Canker) — all are now-endemic,
 * managed-not-eradicated Florida citrus programs.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class AsianCitrusPsyllidIngestionService {
  private readonly logger = new Logger(AsianCitrusPsyllidIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly psyllidClient: AsianCitrusPsyllidClient,
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
        `Background Asian Citrus Psyllid ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
          const result = await this.psyllidClient.queryCountyStatus(property.county);
          countyStatusCache.set(property.county, result?.status ?? null);
        }
        const status = countyStatusCache.get(property.county);
        if (!status) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "medium",
            description: `${property.county} County is under a federal Asian Citrus Psyllid quarantine (${status}). The psyllid is the insect vector that transmits Citrus Greening (HLB); its quarantine drives mandatory grower spray and monitoring programs independent of whether a given grove has tested HLB-positive. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Asian Citrus Psyllid ingestion run ${ingestionRunId} failed: ${message}`);
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
