import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CrpCountyPracticeClient, CrpPracticeResult } from "./crp-county-practice-client";
import { normalizeCountyName } from "./ers-county-economic-client";

const SOURCE = "usda_fsa_crp_county_practice";

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
 * Real ingestion job: attaches the property's own county's real USDA FSA
 * Conservation Reserve Program (CRP) practice-level enrollment acreage —
 * see `CrpCountyPracticeClient`'s doc comment for how this source was
 * verified live (previously unreachable from this environment) and for the
 * real, honest finding that Florida's CRP acreage is Panhandle-concentrated
 * and does not currently overlap this project's seed counties.
 *
 * Same "one client call per run, matched to every property needing data by
 * county name" shape as `ErsCountyEconomicIngestionService` — the whole
 * national workbook is downloaded once, not once per property/county.
 * Unlike that job, this one creates a *one-to-many* set of rows per
 * property (one `PropertyCrpEnrollment` row per real, non-blank CRP
 * practice column for that county), the same one-to-many shape
 * `PropertyRiskFlag`/`PropertyCropCover` already use elsewhere in this
 * module — a genuinely 41-practice-wide source doesn't fit cleanly into a
 * fixed set of named columns on a one-to-one summary row the way ERS's
 * ~5-metric file does.
 *
 * Idempotent by design: a property that already has at least one
 * `PropertyCrpEnrollment` row is treated as already ingested and skipped
 * entirely on a rerun, matching `ErsCountyEconomicIngestionService`'s
 * per-property (not per-row) skip granularity.
 */
@Injectable()
export class CrpCountyPracticeIngestionService {
  private readonly logger = new Logger(CrpCountyPracticeIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crpClient: CrpCountyPracticeClient,
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
        `Background USDA FSA CRP county practice ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
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

      const existing = await this.prisma.propertyCrpEnrollment.findMany({
        where: { propertyId: { in: properties.map((p) => p.id) } },
        select: { propertyId: true },
      });
      const propertiesAlreadyIngested = new Set(existing.map((r) => r.propertyId));

      const propertiesNeedingData = properties.filter((p) => !propertiesAlreadyIngested.has(p.id));
      const countyResults =
        propertiesNeedingData.length > 0
          ? await this.crpClient.fetchFloridaCountyResults()
          : new Map<string, CrpPracticeResult[]>();

      let recordsCreated = 0;
      for (const property of propertiesNeedingData) {
        const practices = countyResults.get(normalizeCountyName(property.county));
        if (!practices || practices.length === 0) continue;

        // All of this property's practice rows are written in a single
        // transaction: a crash partway through must leave zero rows for
        // this property (not a partial set), since idempotency is checked
        // as "property already has at least one row -> skip on retry" —
        // a partial set would otherwise never receive its remaining rows.
        await this.prisma.$transaction(async (tx) => {
          for (const practice of practices) {
            await tx.propertyCrpEnrollment.create({
              data: {
                propertyId: property.id,
                reportPeriod: practice.reportPeriod,
                practiceLabel: practice.practiceLabel,
                practiceCode: practice.practiceCode,
                acres: practice.acres.toFixed(2),
                isTotal: practice.isTotal,
              },
            });
          }
        });
        recordsCreated += practices.length;
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
      this.logger.error(`USDA FSA CRP county practice ingestion run ${ingestionRunId} failed: ${message}`);
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
