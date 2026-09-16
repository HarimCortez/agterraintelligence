import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AsianLonghornedTickClient } from "./asian-longhorned-tick-client";

const SOURCE = "usda_aphis_asian_longhorned_tick";
const RISK_TYPE = "asian_longhorned_tick_detected";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags pasture properties in counties with a
 * confirmed or reported Asian Longhorned Tick detection — see
 * `AsianLonghornedTickClient`'s doc comment for source verification.
 *
 * Scoped to `landUseType: "pasture"` properties only, same reasoning as
 * `HpaiDairyCattleIngestionService` — this tick's real economic impact
 * (severe anemia and documented cattle deaths from massive infestations,
 * plus disease transmission) is specifically a livestock/grazing-land
 * concern, not relevant to row crop, citrus, or timber land.
 *
 * Severity tracks the real `Established_Status` distinction the client
 * surfaces: `high` for "established" (a confirmed, self-sustaining
 * population — the status tied to the documented cattle-death cases),
 * `medium` for "reported" (detected but not yet confirmed established —
 * a real, current risk, but not yet the same order of severity).
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class AsianLonghornedTickIngestionService {
  private readonly logger = new Logger(AsianLonghornedTickIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickClient: AsianLonghornedTickClient,
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
        `Background Asian Longhorned Tick ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const pastureProperties = await this.prisma.property.findMany({
        where: { landUseType: "pasture" },
        select: { id: true, county: true },
      });

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: pastureProperties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const countyResultCache = new Map<string, string | null>();
      let recordsCreated = 0;

      for (const property of pastureProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        if (!countyResultCache.has(property.county)) {
          const result = await this.tickClient.queryCountyStatus(property.county);
          countyResultCache.set(property.county, result?.status ?? null);
        }
        const status = countyResultCache.get(property.county);
        if (!status) continue;

        const severity = status === "established" ? "high" : "medium";
        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity,
            description: `${property.county} County has a ${status} Asian Longhorned Tick (Haemaphysalis longicornis) population on record. Massive infestations of this invasive tick can cause severe anemia and death in cattle, and it is a vector for Theileria orientalis Ikeda, a serious cattle pathogen. Source: USDA APHIS.`,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: pastureProperties.length,
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
      this.logger.error(`Asian Longhorned Tick ingestion run ${ingestionRunId} failed: ${message}`);
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
