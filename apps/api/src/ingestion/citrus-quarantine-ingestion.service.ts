import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CitrusQuarantineClient } from "./citrus-quarantine-client";

const SOURCE = "usda_aphis_citrus_quarantine";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags citrus properties in counties currently under
 * active federal Citrus Greening (HLB) quarantine — see
 * `CitrusQuarantineClient`'s doc comment for how that data source was
 * verified live. Same run/trigger/executeRun shape as the other ingestion
 * jobs, but scoped to `landUseType: "citrus"` properties only and queried
 * per distinct county rather than per property point: a pasture or row
 * crop parcel isn't meaningfully affected by a citrus disease quarantine
 * (it governs movement of citrus nursery stock, budwood, and fruit), so
 * flagging non-citrus land would be real data attached to an irrelevant
 * property — noise, not signal.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried. Distinct counties among the
 * properties being checked are each queried once and cached for the rest
 * of the run, not once per property — Florida's HLB quarantine is
 * genuinely county-granular (confirmed live: every hit returns
 * `Quarantine_Statewide: "Collective"`, a county-by-county designation
 * that currently happens to cover the whole state, not sub-county
 * polygons), so there's no accuracy lost by not doing a per-point query.
 */
@Injectable()
export class CitrusQuarantineIngestionService {
  private readonly logger = new Logger(CitrusQuarantineIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quarantineClient: CitrusQuarantineClient,
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
        `Background citrus quarantine ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
        where: {
          propertyId: { in: citrusProperties.map((p) => p.id) },
          riskType: "citrus_greening_quarantine",
        },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const countyStatusCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of citrusProperties) {
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
            riskType: "citrus_greening_quarantine",
            severity: "medium",
            description: `${property.county} County is under a federal Citrus Greening (HLB) quarantine (${status}), restricting movement of citrus nursery stock, budwood, and fruit. HLB is an incurable, yield-reducing disease affecting citrus groves throughout Florida. Source: USDA APHIS Plant Protection and Quarantine.`,
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
      this.logger.error(`Citrus quarantine ingestion run ${ingestionRunId} failed: ${message}`);
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
