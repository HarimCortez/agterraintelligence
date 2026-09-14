import { Injectable, Logger } from "@nestjs/common";
import AdmZip from "adm-zip";

/**
 * RMA's real, most-recent-substantially-settled crop year at the time
 * this was verified. Bump this by hand once a newer year's claims have
 * had time to settle — RMA republishes `colsom_{year}.zip` continuously
 * as claims for that year are filed, so a just-elapsed year is
 * meaningfully incomplete for a while after it ends.
 */
export const CAUSE_OF_LOSS_YEAR = 2024;
const COL_FILE_URL = `https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/cause_of_loss/colsom_${CAUSE_OF_LOSS_YEAR}.zip`;

/**
 * RMA's own cause-of-loss code for "ARPI/SCO/ECO/STAX/MP/PACE Crops
 * Only" — not a physical peril. It's RMA's catch-all bucket for
 * area/index-based insurance products (ARPI, STAX, etc.), where a loss
 * is triggered by a county-level revenue shortfall rather than
 * attributed to one named cause. Confirmed live: it's frequently the
 * single largest dollar figure in the raw data for a county, so it's
 * excluded from the top-cause ranking (but not from the total).
 */
const NON_PERIL_CAUSE_CODE = "55";

export interface CountyCropLossResult {
  countyTopCauseOfLoss: string | null;
  countyTopCauseOfLossIndemnityCents: number | null;
  countyTotalIndemnityCents: number | null;
}

/**
 * Client for the real USDA Risk Management Agency (RMA) federal crop
 * insurance Cause of Loss Summary of Business data. Sourced from RMA's
 * free, keyless yearly bulk file (`pubfs-rma.fpac.usda.gov`) — unlike
 * NASS's Census of Agriculture, there's no gated live API to fall back
 * from here at all; a real, keyless bulk file is simply how RMA
 * publishes this. It's also a much lighter download than NASS's:
 * confirmed live, the whole nationwide file is ~6MB compressed, not
 * ~300MB.
 *
 * Verified live before building: fetched RMA's own record-layout PDF and
 * confirmed the exact 30-field pipe-delimited column order against a
 * real sample row, byte-for-byte, rather than guessing at field
 * positions. Real county-level figures were confirmed for all 5 of this
 * project's target counties — e.g. Highlands and Polk (Florida's citrus
 * belt) both show Freeze as the dominant real cause of loss ($8.7M and
 * $7.7M respectively in 2024), matching well-documented Florida citrus
 * freeze history.
 *
 * A third real county-name spelling variant was found here (after
 * NASS's "DE SOTO" and this project's own "DeSoto", which matches
 * FIA's spelling): RMA spells it "De Soto". Handled the same generic
 * way as every other source — normalize (uppercase, strip whitespace)
 * rather than hardcoding the exception.
 */
@Injectable()
export class RmaCauseOfLossClient {
  private readonly logger = new Logger(RmaCauseOfLossClient.name);

  async fetchFloridaCountyResults(): Promise<Map<string, CountyCropLossResult>> {
    let buffer: Buffer;
    try {
      const response = await fetch(COL_FILE_URL, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        this.logger.warn(`RMA Cause of Loss bulk file request returned HTTP ${response.status}`);
        return new Map();
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(`RMA Cause of Loss bulk file fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      return new Map();
    }

    let text: string;
    try {
      const zip = new AdmZip(buffer);
      const entry = zip.getEntries().find((e) => e.entryName.endsWith(".txt"));
      if (!entry) {
        this.logger.warn("RMA Cause of Loss zip archive contained no .txt entry");
        return new Map();
      }
      text = entry.getData().toString("latin1");
    } catch (error) {
      this.logger.warn(`RMA Cause of Loss zip extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return new Map();
    }

    const totalsByCounty = new Map<string, number>();
    const causeTotalsByCounty = new Map<string, Map<string, number>>();

    for (const line of text.split("\n")) {
      const parsed = parseCauseOfLossLine(line);
      if (!parsed) continue;

      totalsByCounty.set(parsed.county, (totalsByCounty.get(parsed.county) ?? 0) + parsed.indemnityCents);

      if (parsed.causeCode === NON_PERIL_CAUSE_CODE) continue;
      const causeTotals = causeTotalsByCounty.get(parsed.county) ?? new Map<string, number>();
      causeTotals.set(parsed.cause, (causeTotals.get(parsed.cause) ?? 0) + parsed.indemnityCents);
      causeTotalsByCounty.set(parsed.county, causeTotals);
    }

    const results = new Map<string, CountyCropLossResult>();
    for (const [county, total] of totalsByCounty) {
      const causeTotals = causeTotalsByCounty.get(county);
      let topCause: string | null = null;
      let topCauseCents: number | null = null;
      if (causeTotals) {
        for (const [cause, cents] of causeTotals) {
          if (topCauseCents === null || cents > topCauseCents) {
            topCause = cause;
            topCauseCents = cents;
          }
        }
      }
      results.set(county, {
        countyTopCauseOfLoss: topCause,
        countyTopCauseOfLossIndemnityCents: topCauseCents,
        countyTotalIndemnityCents: total,
      });
    }

    return results;
  }
}

interface ParsedCauseOfLossLine {
  county: string;
  causeCode: string;
  cause: string;
  indemnityCents: number;
}

/** Normalizes a county name for matching: uppercase, whitespace stripped. */
export function normalizeCountyName(county: string): string {
  return county.toUpperCase().replace(/\s+/g, "");
}

/**
 * Parses one pipe-delimited row of RMA's Cause of Loss Summary of
 * Business file (real field order confirmed against RMA's own
 * record-layout PDF, no header row in the file itself). Returns null
 * for any row that isn't a real Florida row with a parseable indemnity
 * amount, or whose county is RMA's "All Other Counties" suppression
 * bucket. Exported standalone so it can be unit tested directly against
 * real sample lines without touching the network.
 */
export function parseCauseOfLossLine(line: string): ParsedCauseOfLossLine | null {
  const fields = line.split("|");
  if (fields.length < 30) return null;

  const stateAbbr = fields[2];
  const countyName = fields[4]?.trim();
  const causeCode = fields[11];
  const cause = fields[12]?.trim();
  const rawIndemnity = fields[28];

  if (stateAbbr !== "FL") return null;
  if (!countyName || countyName === "All Other Counties") return null;
  if (!causeCode || !cause) return null;

  const indemnityDollars = Number(rawIndemnity);
  if (!Number.isFinite(indemnityDollars)) return null;

  return {
    county: normalizeCountyName(countyName),
    causeCode,
    cause,
    indemnityCents: Math.round(indemnityDollars * 100),
  };
}
