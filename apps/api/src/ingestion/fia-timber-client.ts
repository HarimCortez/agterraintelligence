import { Injectable, Logger } from "@nestjs/common";

const FIA_REPORT_URL = "https://apps.fs.usda.gov/fiadb-api/fullreport";

/**
 * Florida's evaluation group code (`wc` parameter) — a rotating multi-year
 * panel identifier, not a single calendar year: "122022" is the panel
 * ending in 2022 (spanning field visits from 2016-2022), the standard FIA
 * design for the eastern US. Bump this (and `FIA_EVAL_YEAR`) by hand when
 * Florida's evaluation rotates forward — look up the new code at
 * `https://apps.fs.usda.gov/fiadb-api/fullreport/parameters/wc` (search
 * for "FLORIDA").
 */
const FIA_EVAL_CODE = "122022";
export const FIA_EVAL_YEAR = 2022;

/** ATTRIBUTE_NBR for "Net merchantable bole wood volume of live trees (timber species at least 5 inches d.b.h.), in cubic feet, on timberland" — found live via `/fullreport/parameters/snum`. */
const SNUM_TIMBER_VOLUME_CU_FT = "574172";
/** ATTRIBUTE_NBR for "Area of timberland, in acres". */
const SNUM_TIMBERLAND_ACRES = "3";

export interface CountyTimberResult {
  countyTimberlandAcres: number | null;
  countyTimberVolumeCuFtPerAcre: number | null;
  countyTimberVolumeSamplingErrorPct: number | null;
}

interface FiaEstimateRow {
  ESTIMATE: number;
  /** e.g. "`12105 12105 FL Polk" — a backtick-prefixed FIPS pair, state abbreviation, then the (possibly multi-word, e.g. "St. Lucie") county name. */
  GRP1: string;
  PLOT_COUNT: number;
  SE_PERCENT: number;
}

interface FiaReportResponse {
  estimates?: FiaEstimateRow[];
}

/**
 * Client for the real USDA Forest Service Forest Inventory and Analysis
 * (FIA) program — the free, keyless FIADB-API (`apps.fs.usda.gov/fiadb-api`).
 * Unlike `NassAgCensusClient`'s source, this one needed no bulk-file
 * workaround: it's a real, live, keyless JSON endpoint, confirmed directly
 * before building anything (`?outputFormat=NJSON` on the real live
 * service). A single request scoped to Florida (`wc=122022`) returns every
 * Florida county's estimate in one response — same "one fetch serves every
 * county, cached for the whole run" shape as `NassAgCensusClient`, just
 * without needing to stream/decompress a large file first.
 *
 * Two metrics tracked: timberland acreage (a real county total) and timber
 * volume density in cubic feet per acre (computed here by dividing FIA's
 * own total-volume estimate by its total-timberland-acres estimate for the
 * same county — the standard way foresters express stocking density,
 * mirroring how `PropertyAgCensusSummary` normalizes land value per acre
 * rather than storing a raw county total).
 *
 * These are design-based statistical estimates from a genuinely sparse
 * field-plot sample — confirmed live across this project's 5 target
 * counties, sampling error on the volume estimate ranges from 18% (Polk,
 * 56+ plots) to 46% (Okeechobee, 7 plots) — so the sampling error is
 * fetched and persisted alongside the estimate, not discarded, and the
 * caller should present it as a real, honest caveat rather than a precise
 * figure.
 *
 * Confirmed live before building: FIA spells "DeSoto" County exactly the
 * same way this project's own `properties.county` does (unlike NASS's
 * Census of Agriculture data, which spells it "DE SOTO" with a space) —
 * still normalized the same generic way as `normalizeCountyName` for
 * every county, rather than assuming the two sources will always agree.
 */
@Injectable()
export class FiaTimberClient {
  private readonly logger = new Logger(FiaTimberClient.name);

  async fetchFloridaCountyResults(): Promise<Map<string, CountyTimberResult>> {
    const [volumeRows, acresRows] = await Promise.all([
      this.fetchEstimates(SNUM_TIMBER_VOLUME_CU_FT),
      this.fetchEstimates(SNUM_TIMBERLAND_ACRES),
    ]);

    const acresByCounty = new Map<string, number>();
    for (const row of acresRows) {
      const county = parseCountyName(row.GRP1);
      if (county) acresByCounty.set(county, row.ESTIMATE);
    }

    const results = new Map<string, CountyTimberResult>();
    for (const row of volumeRows) {
      const county = parseCountyName(row.GRP1);
      if (!county) continue;

      const acres = acresByCounty.get(county);
      const volumePerAcre = acres && acres > 0 ? Math.round(row.ESTIMATE / acres) : null;

      results.set(county, {
        countyTimberlandAcres: acres !== undefined ? Math.round(acres) : null,
        countyTimberVolumeCuFtPerAcre: volumePerAcre,
        countyTimberVolumeSamplingErrorPct: Number.isFinite(row.SE_PERCENT) ? row.SE_PERCENT : null,
      });
    }

    return results;
  }

  private async fetchEstimates(snum: string): Promise<FiaEstimateRow[]> {
    const params = new URLSearchParams({
      rselected: "County code and name",
      cselected: "Total",
      snum,
      wc: FIA_EVAL_CODE,
      outputFormat: "NJSON",
    });

    let response: Response;
    try {
      response = await fetch(`${FIA_REPORT_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      this.logger.warn(`FIADB-API request failed for snum ${snum}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }

    if (!response.ok) {
      this.logger.warn(`FIADB-API returned HTTP ${response.status} for snum ${snum}`);
      return [];
    }

    const body = (await response.json()) as FiaReportResponse;
    return body.estimates ?? [];
  }
}

/** Normalizes a county name for matching: uppercase, whitespace stripped. */
export function normalizeCountyName(county: string): string {
  return county.toUpperCase().replace(/\s+/g, "");
}

/**
 * Parses FIA's `GRP1` label (e.g. "`12105 12105 FL Polk" or
 * "`12111 12111 FL St. Lucie") into a normalized county name. The county
 * name is everything after the two FIPS tokens and the state
 * abbreviation — not just the last word — since real Florida county names
 * are sometimes multi-word (confirmed live: "Palm Beach", "St. Lucie").
 * Exported standalone so it can be unit tested directly against real
 * sample values without a network call.
 */
export function parseCountyName(grp1: string): string | null {
  const parts = grp1.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return normalizeCountyName(parts.slice(3).join(" "));
}
