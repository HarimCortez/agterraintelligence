import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ErsPovertyIncomeClient, POVERTY_INCOME_YEAR } from "./ers-poverty-income-client";
import { normalizeCountyName } from "./ers-county-economic-client";

const SOURCE = "usda_ers_poverty_income";

interface PropertyCountySummaryRow {
  propertyId: string;
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
 * Real ingestion job: attaches the property's own county's USDA ERS
 * poverty and per capita income estimates to the existing
 * `PropertyCountyEconomicSummary` row — see `ErsPovertyIncomeClient`'s
 * doc comment for source verification and why this doesn't duplicate
 * the existing median household income field.
 *
 * Same shape as `ErsCountyTypologyIngestionService`: requires
 * `ErsCountyEconomicIngestionService` to have already run for a
 * property (updates the existing summary row rather than creating one),
 * swept across all properties, one client call per run. Idempotent by
 * design: a summary row where `povertyIncomeYear` is already set (only
 * by this job) is treated as already ingested and skipped.
 */
@Injectable()
export class ErsPovertyIncomeIngestionService {
  private readonly logger = new Logger(ErsPovertyIncomeIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly povertyIncomeClient: ErsPovertyIncomeClient,
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
        `Background ERS poverty/income ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const summaryRows = await this.prisma.$queryRaw<PropertyCountySummaryRow[]>`
        SELECT pces.property_id AS "propertyId", p.county AS county
        FROM property_county_economic_summary pces
        JOIN properties p ON p.id = pces.property_id
        WHERE pces.poverty_income_year IS NULL
      `;

      const countyResults =
        summaryRows.length > 0 ? await this.povertyIncomeClient.fetchFloridaCountyResults() : new Map();

      let recordsCreated = 0;
      for (const row of summaryRows) {
        const result = countyResults.get(normalizeCountyName(row.county));
        if (!result) continue;

        await this.prisma.propertyCountyEconomicSummary.update({
          where: { propertyId: row.propertyId },
          data: {
            povertyIncomeYear: POVERTY_INCOME_YEAR,
            countyPovertyRatePct: result.countyPovertyRatePct,
            countyChildPovertyRatePct: result.countyChildPovertyRatePct,
            countyDeepPovertyRatePct: result.countyDeepPovertyRatePct,
            countyPerCapitaIncomeCents: result.countyPerCapitaIncomeCents,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          itemsProcessed: summaryRows.length,
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
      this.logger.error(`ERS poverty/income ingestion run ${ingestionRunId} failed: ${message}`);
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
