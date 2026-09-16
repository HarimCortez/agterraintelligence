import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { SweetOrangeScabClient } from "./sweet-orange-scab-client";

const SOURCE = "usda_aphis_sweet_orange_scab_quarantine";
const RISK_TYPE = "sweet_orange_scab_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags citrus properties in counties currently
 * under active federal Sweet Orange Scab quarantine — see
 * `SweetOrangeScabClient`'s doc comment for source verification. Same
 * run/trigger/executeRun shape and county-caching approach as
 * `CitrusCankerIngestionService`/`AsianCitrusPsyllidIngestionService`,
 * scoped to `landUseType: "citrus"` properties only for the same
 * reason.
 *
 * Severity `low`, deliberately one tier below the other three Florida
 * citrus quarantine flags (HLB, Citrus Canker, Asian Citrus Psyllid —
 * all `medium`) — Sweet Orange Scab causes cosmetic fruit blemishing
 * that affects fresh-fruit marketability, not tree health or yield, a
 * real but genuinely lower economic severity.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class SweetOrangeScabIngestionService {
  private readonly logger = new Logger(SweetOrangeScabIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scabClient: SweetOrangeScabClient,
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
        `Background Sweet Orange Scab ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
          const result = await this.scabClient.queryCountyStatus(property.county);
          countyStatusCache.set(property.county, result?.status ?? null);
        }
        const status = countyStatusCache.get(property.county);
        if (!status) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "low",
            description: `${property.county} County is under a federal Sweet Orange Scab quarantine (${status}), restricting movement of citrus nursery stock, budwood, and fruit. Sweet Orange Scab causes cosmetic fruit blemishing that affects fresh-fruit marketability but not tree health or yield — a real but lower economic severity than Florida's other citrus quarantine programs. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Sweet Orange Scab ingestion run ${ingestionRunId} failed: ${message}`);
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
