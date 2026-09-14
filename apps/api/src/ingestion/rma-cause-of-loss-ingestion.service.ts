import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CAUSE_OF_LOSS_YEAR, normalizeCountyName, RmaCauseOfLossClient } from "./rma-cause-of-loss-client";

const SOURCE = "usda_rma_cause_of_loss";

interface PropertyCountyRow {
  id: string;
  county: string;
}

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: attaches the property's own county's USDA Risk
 * Management Agency (RMA) federal crop insurance Cause of Loss figures —
 * see `RmaCauseOfLossClient`'s doc comment for how this data source was
 * verified live.
 *
 * Swept across all properties, not scoped to a land use type — same
 * reasoning as `NassAgCensusIngestionService`, not
 * `FiaTimberIngestionService`: crop-loss risk context (what perils have
 * actually caused real, paid claims in this county) is relevant
 * background for any agricultural land, regardless of what's currently
 * listed.
 *
 * Same "one client call serves every county" shape as the ag census and
 * FIA jobs: RMA's bulk file covers every Florida county in a single
 * download, so the client is called exactly once per run (only when at
 * least one property still needs data), not once per property.
 * Idempotent by design: a property that already has this row is skipped.
 */
@Injectable()
export class RmaCauseOfLossIngestionService {
  private readonly logger = new Logger(RmaCauseOfLossIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly causeOfLossClient: RmaCauseOfLossClient,
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
        `Background RMA cause of loss ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const properties = await this.prisma.$queryRaw<PropertyCountyRow[]>`
        SELECT id, county FROM properties
      `;

      const existing = await this.prisma.propertyCropLossSummary.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      const propertiesNeedingData = properties.filter((p) => !propertiesAlreadyIngested.has(p.id));
      const countyResults =
        propertiesNeedingData.length > 0 ? await this.causeOfLossClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const property of propertiesNeedingData) {
        const result = countyResults.get(normalizeCountyName(property.county));
        if (!result || result.countyTotalIndemnityCents === null) continue;

        await this.prisma.propertyCropLossSummary.create({
          data: {
            propertyId: property.id,
            year: CAUSE_OF_LOSS_YEAR,
            countyTopCauseOfLoss: result.countyTopCauseOfLoss,
            countyTopCauseOfLossIndemnityCents: result.countyTopCauseOfLossIndemnityCents,
            countyTotalIndemnityCents: result.countyTotalIndemnityCents,
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
      this.logger.error(`RMA cause of loss ingestion run ${ingestionRunId} failed: ${message}`);
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
