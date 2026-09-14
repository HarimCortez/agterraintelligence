import { Injectable, Logger } from "@nestjs/common";
import * as https from "node:https";
import * as readline from "node:readline";
import * as zlib from "node:zlib";

/**
 * The bulk file NASS republishes every year for the most recent Census of
 * Agriculture (currently 2022; the next Census year, 2027, won't have a
 * file here until NASS publishes it — likely ~early 2029, based on the
 * ~2-year lag between the 2022 Census year and its February 2024
 * publication). Bumping `CENSUS_YEAR`/`CENSUS_FILE_URL` together is a
 * manual, deliberate update when that happens, not something to automate
 * against a moving "latest" URL that doesn't exist.
 */
const CENSUS_YEAR = 2022;
const CENSUS_FILE_URL = `https://www.nass.usda.gov/datasets/qs.census${CENSUS_YEAR}.txt.gz`;

const CATTLE_SHORT_DESC = "CATTLE, INCL CALVES - INVENTORY";
const LAND_VALUE_SHORT_DESC = "AG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE";

export interface CountyAgCensusResult {
  countyCattleInventoryHead: number | null;
  countyAgLandValueCentsPerAcre: number | null;
}

/**
 * Client for the real USDA NASS Census of Agriculture — sourced via NASS's
 * free, keyless bulk data files (`nass.usda.gov/datasets/`) rather than the
 * live Quick Stats API, which turned out to require a registered API key
 * delivered by email (submit a registration form, wait for NASS to email a
 * key back) — the first data source in this project with no keyless path
 * at all. Confirmed directly: an unauthenticated API query returns
 * `{"error":["unauthorized"]}`. The bulk file is the same underlying data
 * (confirmed live: identical field taxonomy — SOURCE_DESC, SHORT_DESC,
 * COUNTY_NAME, VALUE, etc. — matching the API's documented parameters) as
 * a public, no-auth-required download instead.
 *
 * Mechanics: streams the ~300MB gzip file (Node's built-in `https` +
 * `zlib.createGunzip()` + `readline`, never buffering the whole file in
 * memory) and keeps only Florida county-level rows matching one of the two
 * tracked metrics. Verified live before building the ingestion job: a full
 * real run over the actual 2022 file completes in under a minute on a
 * normal connection.
 *
 * Only two metrics are tracked, deliberately narrow:
 * - `CATTLE, INCL CALVES - INVENTORY` (domain "TOTAL") — county-wide
 *   cattle headcount, relevant to pasture/mixed-agricultural land.
 * - `AG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE` (domain
 *   "TOTAL") — the county-wide average land value per acre, pooled across
 *   every agricultural land use in the county (not the same as a precise
 *   same-land-use appraisal comp, but a real, useful county benchmark
 *   against a property's own price/acre).
 *
 * Both are Census-of-Agriculture-only (published every 5 years) because
 * that's the only NASS program with COUNTY granularity for these figures —
 * confirmed live in the Quick Stats query tool that the annual Survey
 * program (which would give fresher, non-Census-year numbers) only
 * publishes Florida citrus yield/production/price at STATE/NATIONAL level,
 * not county, so there's no fresher county-level alternative to fall back
 * to for those figures.
 *
 * A real, not-obviously-a-quirk finding surfaced while verifying county
 * name matching: NASS's `COUNTY_NAME` field spells DeSoto County as
 * "DE SOTO" (with a space) — different from this project's own
 * `properties.county` value ("DeSoto"). Matching normalizes both sides
 * (uppercase, strip whitespace) rather than hardcoding that one exception,
 * so it holds for any other county whose spelling drifts the same way.
 */
@Injectable()
export class NassAgCensusClient {
  private readonly logger = new Logger(NassAgCensusClient.name);

  /**
   * Downloads and parses the full bulk file once, returning a lookup keyed
   * by normalized county name for every Florida county with COUNTY-level
   * data for the two tracked metrics — not scoped to a specific county
   * list, since the file contains every Florida county regardless and a
   * second download per county would be strictly worse than parsing once.
   */
  async fetchFloridaCountyResults(): Promise<Map<string, CountyAgCensusResult>> {
    const results = new Map<string, CountyAgCensusResult>();

    const lineStream = await this.openLineStream();
    for await (const line of lineStream) {
      const parsed = parseCensusLine(line);
      if (!parsed) continue;

      const existing = results.get(parsed.normalizedCounty) ?? {
        countyCattleInventoryHead: null,
        countyAgLandValueCentsPerAcre: null,
      };

      if (parsed.metric === "cattle") {
        existing.countyCattleInventoryHead = parsed.value;
      } else {
        existing.countyAgLandValueCentsPerAcre = Math.round(parsed.value * 100);
      }

      results.set(parsed.normalizedCounty, existing);
    }

    return results;
  }

  private async openLineStream(): Promise<readline.Interface> {
    try {
      return await new Promise<readline.Interface>((resolve, reject) => {
        const request = https.get(CENSUS_FILE_URL, { timeout: 120_000 }, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`NASS Census bulk file request returned HTTP ${response.statusCode}`));
            return;
          }
          const gunzip = zlib.createGunzip();
          response.pipe(gunzip);
          gunzip.on("error", (error) => reject(error));
          resolve(readline.createInterface({ input: gunzip, crlfDelay: Infinity }));
        });
        request.on("error", (error) => reject(error));
        request.on("timeout", () => request.destroy(new Error("NASS Census bulk file request timed out")));
      });
    } catch (error) {
      this.logger.warn(`NASS Census bulk file fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

interface ParsedCensusLine {
  normalizedCounty: string;
  metric: "cattle" | "landValue";
  value: number;
}

/** Normalizes a county name for matching: uppercase, whitespace stripped — handles "DE SOTO" vs "DeSoto" generically rather than special-casing it. */
export function normalizeCountyName(county: string): string {
  return county.toUpperCase().replace(/\s+/g, "");
}

/**
 * Parses one tab-delimited row of the NASS bulk export format. Returns null
 * for any row that isn't a Florida COUNTY-level Census row matching one of
 * the two tracked short_desc/domain combinations, or whose VALUE is a
 * non-numeric NASS disclosure/quality sentinel (e.g. "(D)" for withheld).
 * Exported standalone (not a private method) so it can be unit tested
 * directly against real sample lines without touching the network.
 */
export function parseCensusLine(line: string): ParsedCensusLine | null {
  const fields = line.split("\t");
  if (fields.length < 39) return null;

  const sourceDesc = fields[0];
  const shortDesc = fields[9];
  const domainDesc = fields[10];
  const aggLevelDesc = fields[12];
  const stateAlpha = fields[15];
  const countyName = fields[21];
  const rawValue = fields[37];

  if (sourceDesc !== "CENSUS" || aggLevelDesc !== "COUNTY" || stateAlpha !== "FL") return null;
  if (domainDesc !== "TOTAL") return null;
  if (countyName === undefined || countyName === "") return null;

  let metric: "cattle" | "landValue";
  if (shortDesc === CATTLE_SHORT_DESC) {
    metric = "cattle";
  } else if (shortDesc === LAND_VALUE_SHORT_DESC) {
    metric = "landValue";
  } else {
    return null;
  }

  const numericValue = Number((rawValue ?? "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;

  return { normalizedCounty: normalizeCountyName(countyName), metric, value: numericValue };
}
