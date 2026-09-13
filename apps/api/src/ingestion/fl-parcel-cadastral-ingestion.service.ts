import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { FlParcelClient } from "./fl-parcel-client";

const SOURCE = "fl_dor_cadastral";

/**
 * The 4 of this deployment's 5 seed-property counties covered by the
 * SWFWMD shared parcel_search MapServer, mapped to that service's layer
 * IDs (confirmed via that service's own layer listing, not guessed at).
 * Okeechobee is NOT included — it falls under South Florida Water
 * Management District, not SWFWMD, and no equivalent free/queryable
 * per-county GIS service for it was found during this pass (its own
 * Property Appraiser GIS viewer doesn't expose a discoverable public
 * ArcGIS REST endpoint). Real, flagged gap — not a silent omission.
 */
const TARGET_COUNTIES: { name: string; layerId: number }[] = [
  { name: "DeSoto", layerId: 3 },
  { name: "Hardee", layerId: 4 },
  { name: "Highlands", layerId: 6 },
  { name: "Polk", layerId: 14 },
];

/** Florida DOR's official Agricultural land-use code table (codes 50-69) — from the statewide Cadastral/NAL field reference. Used for consistent, clean display text instead of each county's own raw (all-caps, occasionally abbreviated) `PARUSEDESC` string. */
const DOR_USE_DESCRIPTIONS: Record<string, string> = {
  "050": "Improved agricultural",
  "051": "Cropland soil capability Class I",
  "052": "Cropland soil capability Class II",
  "053": "Cropland soil capability Class III",
  "054": "Timberland - site index 90 and above",
  "055": "Timberland - site index 80 to 89",
  "056": "Timberland - site index 70 to 79",
  "057": "Timberland - site index 60 to 69",
  "058": "Timberland - site index 50 to 59",
  "059": "Timberland not classified by site index to Pines",
  "060": "Grazing land soil capability Class I",
  "061": "Grazing land soil capability Class II",
  "062": "Grazing land soil capability Class III",
  "063": "Grazing land soil capability Class IV",
  "064": "Grazing land soil capability Class V",
  "065": "Grazing land soil capability Class VI",
  "066": "Orchard Groves, Citrus, etc.",
  "067": "Poultry, bees, tropical fish, rabbits, etc.",
  "068": "Dairies, feed lots",
  "069": "Ornamentals, miscellaneous agricultural",
};

const MAX_JUST_VALUE_CENTS = 2_147_483_647;

export interface IngestionRunSummary {
  id: string;
  status: "succeeded" | "failed";
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

/**
 * Real ingestion job: sweeps the SWFWMD per-county parcel service (see
 * `FlParcelClient`'s doc comment for why this replaced the FL DOR
 * statewide FeatureServer originally planned) for the 4 covered target
 * counties, filtered to agricultural land-use codes, creating a
 * `ParcelRecord` row per real parcel. Deliberately kept in its own table,
 * never merged into `properties` — see `ParcelRecord`'s doc comment in
 * schema.prisma.
 *
 * Idempotent by design, same as `FemaFloodZoneIngestionService`: a parcel
 * already ingested (same `source`+`parcelId`) is skipped, not
 * re-fetched/updated, on a rerun — a deliberate scope match to that job's
 * own precedent rather than building update-on-rerun logic in this pass.
 *
 * A parcel missing a real total value, or whose value would overflow this
 * schema's `Int` cents column, is skipped and logged rather than recorded
 * with a fabricated or truncated number — per this project's standing
 * "never fabricate data" rule. Same for a parcel with no derivable
 * acreage (a null `Shape.STArea()`).
 */
@Injectable()
export class FlParcelCadastralIngestionService {
  private readonly logger = new Logger(FlParcelCadastralIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flParcelClient: FlParcelClient,
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
        `Background FL parcel cadastral ingestion run ${ingestionRun.id} crashed outside its own error handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { id: ingestionRun.id };
  }

  private async executeRun(ingestionRunId: string): Promise<IngestionRunSummary> {
    try {
      let itemsProcessed = 0;
      let recordsCreated = 0;

      for (const county of TARGET_COUNTIES) {
        const features = await this.flParcelClient.queryAgriculturalParcels(county.layerId);
        itemsProcessed += features.length;
        if (features.length === 0) continue;

        const existing = await this.prisma.parcelRecord.findMany({
          where: { source: SOURCE, parcelId: { in: features.map((f) => f.parcelId) } },
          select: { parcelId: true },
        });
        const alreadyIngested = new Set(existing.map((r) => r.parcelId));

        for (const feature of features) {
          if (alreadyIngested.has(feature.parcelId)) continue;

          if (feature.totalValueDollars == null || feature.acreage == null || feature.acreage <= 0) {
            this.logger.warn(
              `Skipping parcel ${feature.parcelId} (${county.name}) — missing total value or acreage`,
            );
            continue;
          }

          const justValueCents = Math.round(feature.totalValueDollars * 100);
          if (justValueCents > MAX_JUST_VALUE_CENTS) {
            this.logger.warn(
              `Skipping parcel ${feature.parcelId} (${county.name}) — value exceeds storable range`,
            );
            continue;
          }

          await this.prisma.parcelRecord.create({
            data: {
              source: SOURCE,
              county: county.name,
              parcelId: feature.parcelId,
              ownerName: feature.ownerName,
              siteAddress: feature.siteAddress,
              siteCity: feature.siteCity,
              legalDescription: feature.legalDescription,
              dorUseCode: feature.dorUseCode,
              dorUseDescription: DOR_USE_DESCRIPTIONS[feature.dorUseCode] ?? "Agricultural (unclassified)",
              acreage: feature.acreage.toFixed(2),
              justValueCents,
            },
          });
          recordsCreated++;
        }
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
      this.logger.error(`FL parcel cadastral ingestion run ${ingestionRunId} failed: ${message}`);
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
