import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { HpaiDairyCattleClient } from "./hpai-dairy-cattle-client";

const SOURCE = "usda_aphis_hpai_dairy_cattle";
const RISK_TYPE = "hpai_dairy_cattle_confirmed_in_state";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: flags properties in states with confirmed Highly
 * Pathogenic Avian Influenza (H5N1) detections in dairy cattle — see
 * `HpaiDairyCattleClient`'s doc comment for source verification.
 *
 * Scoped to `landUseType: "pasture"` properties only — this schema has no
 * dedicated `livestock` land-use type (confirmed: `LandUseType` is
 * `row_crop`/`pasture`/`timber`/`citrus`/`mixed_agricultural`/
 * `vacant_agricultural`), and `pasture` (grazing land) is the real closest
 * proxy for cattle operations, the same reasoning that scopes the
 * timber-pest jobs to `timber`. Severity `medium`:
 * a real, active, economically significant outbreak (herd quarantine,
 * milk production loss, movement restrictions) but not an existential
 * threat to the land asset itself the way a lethal tree quarantine is to
 * a timber stand.
 *
 * State-level, not county-level, matching `HpaiDairyCattleClient`'s real
 * data granularity — this changes the query key from `property.county`
 * (every other client in this module) to `property.state`, and the cache
 * is keyed on state accordingly.
 *
 * Idempotent by design, same as the other jobs: a property that already
 * has this flag is skipped, not re-queried.
 */
@Injectable()
export class HpaiDairyCattleIngestionService {
  private readonly logger = new Logger(HpaiDairyCattleIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hpaiClient: HpaiDairyCattleClient,
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
        `Background HPAI dairy cattle ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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
        select: { id: true, state: true },
      });

      const existingFlags = await this.prisma.propertyRiskFlag.findMany({
        where: { propertyId: { in: pastureProperties.map((p) => p.id) }, riskType: RISK_TYPE },
        select: { propertyId: true },
      });
      const propertiesAlreadyFlagged = new Set(existingFlags.map((f) => f.propertyId));

      const stateResultCache = new Map<string, number | null>();
      let recordsCreated = 0;

      for (const property of pastureProperties) {
        if (propertiesAlreadyFlagged.has(property.id)) continue;

        if (!stateResultCache.has(property.state)) {
          const result = await this.hpaiClient.queryStateStatus(property.state);
          stateResultCache.set(property.state, result?.totalConfirmedEvents ?? null);
        }
        const totalConfirmedEvents = stateResultCache.get(property.state);
        if (!totalConfirmedEvents) continue;

        await this.prisma.propertyRiskFlag.create({
          data: {
            propertyId: property.id,
            riskType: RISK_TYPE,
            severity: "medium",
            description: `${property.state} has ${totalConfirmedEvents} confirmed Highly Pathogenic Avian Influenza (H5N1) event(s) in dairy cattle on record. HPAI in dairy cattle can trigger herd quarantine and milk production loss; this reflects state-level confirmed detections, not a property-specific finding (USDA APHIS does not publish county-level data for this outbreak). Source: USDA APHIS Veterinary Services.`,
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
      this.logger.error(`HPAI dairy cattle ingestion run ${ingestionRunId} failed: ${message}`);
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
