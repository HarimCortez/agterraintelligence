import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { FsaResaleClient } from "./fsa-resale-client";

const SOURCE = "usda_rd_fsa_resales";

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: sweeps USDA's real RD/FSA Properties resale site
 * for Farm & Ranch listings nationwide, creating an `FsaResaleListing`
 * row per real listing found — see `FsaResaleClient`'s doc comment for
 * source verification, including the real, honest caveat that its
 * results-table parser has not been verified against populated markup
 * (current live inventory is genuinely empty everywhere).
 *
 * Deliberately kept in its own staging table, never merged into
 * `properties` — same reasoning as `FlParcelCadastralIngestionService`
 * and `ParcelRecord`'s doc comment: raw externally-sourced listings need
 * human review (address verification, geocoding, duplicate/staleness
 * checks) before reaching real investors.
 *
 * Nationwide sweep (no state filter passed to the client) — unlike
 * `FlParcelCadastralIngestionService`, which is genuinely Florida-only
 * because its source is Florida's own county GIS infrastructure, FSA
 * repossessed farm/ranch properties can appear in any state, and this
 * project's standing nationwide-scope principle applies directly.
 *
 * Idempotent by design, same as `FlParcelCadastralIngestionService`: a
 * listing already ingested (matching the natural key documented on
 * `FsaResaleListing`) is skipped, not re-fetched/updated, on a rerun.
 */
@Injectable()
export class FsaResaleIngestionService {
  private readonly logger = new Logger(FsaResaleIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fsaResaleClient: FsaResaleClient,
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
        `Background USDA RD/FSA resales ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      const listings = await this.fsaResaleClient.searchFarmAndRanch();
      const itemsProcessed = listings.length;
      let recordsCreated = 0;

      for (const listing of listings) {
        const existing = await this.prisma.fsaResaleListing.findFirst({
          where: {
            source: SOURCE,
            state: listing.state,
            county: listing.county,
            streetAddress: listing.streetAddress,
            priceCents: listing.priceCents,
          },
          select: { id: true },
        });
        if (existing) continue;

        await this.prisma.fsaResaleListing.create({
          data: {
            source: SOURCE,
            state: listing.state,
            county: listing.county,
            city: listing.city,
            zip: listing.zip,
            streetAddress: listing.streetAddress,
            listingType: listing.listingType,
            priceCents: listing.priceCents,
            totalAcres: listing.totalAcres !== null ? listing.totalAcres.toFixed(2) : null,
          },
        });
        recordsCreated++;
      }

      const updated = await this.prisma.ingestionRun.update({
        where: { id: ingestionRunId },
        data: { status: "succeeded", finishedAt: new Date(), itemsProcessed, recordsCreated },
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
      this.logger.error(`USDA RD/FSA resales ingestion run ${ingestionRunId} failed: ${message}`);
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
