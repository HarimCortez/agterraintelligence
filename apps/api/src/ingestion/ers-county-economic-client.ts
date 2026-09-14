import { Injectable, Logger } from "@nestjs/common";

/**
 * Real USDA ERS (Economic Research Service) County-level Data Sets —
 * confirmed live, keyless, no registration, plain CSV downloads at
 * `ers.usda.gov/data-products/county-level-data-sets/`. Two separate files,
 * fetched once per run and merged by county, same shape as
 * `NassAgCensusClient`/`RmaCauseOfLossClient` (one client call serves every
 * county in a single run, not a per-property/per-county query).
 *
 * The eleventh ingestion source and the first that isn't
 * physical/agricultural: population growth and local economic conditions
 * are real, direct context for a land *investment* thesis (development and
 * appreciation pressure, buyer demand) that none of the other ten sources
 * touch.
 *
 * The URLs below carry ERS's own cache-busting `?v=...` query params,
 * captured from the live download page — like `NassAgCensusClient`'s
 * `CENSUS_YEAR`/`CENSUS_FILE_URL`, this is a manual, deliberate update
 * (re-check `ers.usda.gov/data-products/county-level-data-sets/county-level-data-sets-download-data`)
 * when ERS republishes, not something to chase a moving "latest" URL for.
 *
 * A real data quirk found while verifying live: the unemployment/income
 * file's `Area_Name` column is CSV-quoted and contains an embedded comma
 * for Florida rows (e.g. `"DeSoto County, FL"`) while the population
 * file's `Area_Name` never does (`DeSoto County`, no state suffix) — a
 * naive `line.split(",")` silently misaligns every field on that row in
 * the first file. Both files are parsed with the same quote-aware line
 * parser below rather than assuming either format.
 *
 * A second real quirk: the unemployment/income file's own two headline
 * figures have different vintages in the very same row —
 * `Unemployment_rate_2023` sits next to `Median_Household_Income_2022`,
 * because BLS's unemployment estimates (LAUS) publish faster than the
 * Census Bureau's household income estimates (ACS 1-year). Modeled as
 * separate `unemploymentYear`/`incomeYear` on `PropertyCountyEconomicSummary`
 * rather than one shared year field, so the lag is explicit rather than
 * silently wrong.
 *
 * County-name matching reuses the same generic normalize-and-compare
 * approach as every other client in this module (uppercase, strip
 * whitespace) — ERS spells DeSoto County as "DeSoto", matching this
 * project's own spelling (same as FIA, unlike NASS's "DE SOTO" and RMA's
 * "De Soto").
 */
const POPULATION_YEAR = 2023;
const UNEMPLOYMENT_YEAR = 2023;
const INCOME_YEAR = 2022;

const POPULATION_FILE_URL =
  "https://www.ers.usda.gov/media/5499/population-estimates-for-the-united-states-states-and-counties-2020-23.csv?v=80713";
const UNEMPLOYMENT_INCOME_FILE_URL =
  "https://www.ers.usda.gov/media/5497/unemployment-and-median-household-income-for-the-united-states-states-and-counties-2000-23.csv?v=44181";

const POP_ESTIMATE_ATTR = `POP_ESTIMATE_${POPULATION_YEAR}`;
const NET_MIG_ATTR = `NET_MIG_${POPULATION_YEAR}`;
const UNEMPLOYMENT_RATE_ATTR = `Unemployment_rate_${UNEMPLOYMENT_YEAR}`;
const MEDIAN_INCOME_ATTR = `Median_Household_Income_${INCOME_YEAR}`;

export interface CountyEconomicResult {
  populationYear: number;
  countyPopulation: number | null;
  countyNetMigration: number | null;
  unemploymentYear: number;
  countyUnemploymentRatePct: number | null;
  incomeYear: number;
  countyMedianHouseholdIncomeCents: number | null;
}

@Injectable()
export class ErsCountyEconomicClient {
  private readonly logger = new Logger(ErsCountyEconomicClient.name);

  /**
   * Downloads and parses both bulk files once, returning a lookup keyed by
   * normalized county name for every Florida county present. A county
   * missing from one file but not the other still gets a partial result
   * (matches `RmaCauseOfLossClient`'s "still return what's available"
   * behavior) rather than being dropped entirely.
   */
  async fetchFloridaCountyResults(): Promise<Map<string, CountyEconomicResult>> {
    const results = new Map<string, CountyEconomicResult>();

    const [populationRows, unemploymentIncomeRows] = await Promise.all([
      this.fetchCsvRows(POPULATION_FILE_URL, "ERS population estimates"),
      this.fetchCsvRows(UNEMPLOYMENT_INCOME_FILE_URL, "ERS unemployment/income"),
    ]);

    const getOrCreate = (county: string): CountyEconomicResult => {
      const existing = results.get(county);
      if (existing) return existing;
      const created: CountyEconomicResult = {
        populationYear: POPULATION_YEAR,
        countyPopulation: null,
        countyNetMigration: null,
        unemploymentYear: UNEMPLOYMENT_YEAR,
        countyUnemploymentRatePct: null,
        incomeYear: INCOME_YEAR,
        countyMedianHouseholdIncomeCents: null,
      };
      results.set(county, created);
      return created;
    };

    for (const row of populationRows) {
      if (row.state !== "FL") continue;
      const county = parseCountyName(row.areaName);
      if (!county) continue;

      const numericValue = Number(row.value);
      if (!Number.isFinite(numericValue)) continue;

      const record = getOrCreate(county);
      if (row.attribute === POP_ESTIMATE_ATTR) {
        record.countyPopulation = Math.round(numericValue);
      } else if (row.attribute === NET_MIG_ATTR) {
        record.countyNetMigration = Math.round(numericValue);
      }
    }

    for (const row of unemploymentIncomeRows) {
      if (row.state !== "FL") continue;
      const county = parseCountyName(row.areaName);
      if (!county) continue;

      const numericValue = Number(row.value);
      if (!Number.isFinite(numericValue)) continue;

      const record = getOrCreate(county);
      if (row.attribute === UNEMPLOYMENT_RATE_ATTR) {
        record.countyUnemploymentRatePct = numericValue;
      } else if (row.attribute === MEDIAN_INCOME_ATTR) {
        record.countyMedianHouseholdIncomeCents = Math.round(numericValue * 100);
      }
    }

    return results;
  }

  private async fetchCsvRows(url: string, label: string): Promise<ParsedCsvRow[]> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`${label} request returned HTTP ${response.status}`);
        return [];
      }
      const text = await response.text();
      return parseErsCsv(text);
    } catch (error) {
      this.logger.warn(`${label} fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

interface ParsedCsvRow {
  fips: string;
  state: string;
  areaName: string;
  attribute: string;
  value: string;
}

/** Normalizes a county name for matching: uppercase, whitespace stripped. */
export function normalizeCountyName(county: string): string {
  return county.toUpperCase().replace(/\s+/g, "");
}

/**
 * Strips ERS's " County" / " County, FL" suffix from an Area_Name and
 * normalizes it, returning null for anything that isn't a county row (e.g.
 * the state-level "Florida" total, which has no such suffix). Exported
 * standalone for direct unit testing.
 */
export function parseCountyName(areaName: string): string | null {
  const match = /^(.*?)\s+County(?:,\s*[A-Z]{2})?$/.exec(areaName.trim());
  if (!match || !match[1]) return null;
  return normalizeCountyName(match[1]);
}

/**
 * Quote-aware CSV line splitter — ERS's `Area_Name` column is quoted and
 * contains an embedded comma for Florida rows in the unemployment/income
 * file (e.g. `"DeSoto County, FL"`), which a naive `line.split(",")` would
 * silently misalign. Handles doubled-quote escaping (`""`) per standard CSV
 * quoting, though ERS's own files never use it.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parses ERS's long-format CSV (`FIPS_Code/FIPStxt,State,Area_Name,Attribute,Value`
 * — the first column's name differs slightly between the two files, but the
 * position and meaning are identical) into rows. Skips the header and any
 * malformed line. Exported standalone for direct unit testing against real
 * captured sample lines.
 */
export function parseErsCsv(text: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length === 0) continue;

    const fields = splitCsvLine(line);
    if (fields.length < 5) continue;

    const [fips, state, areaName, attribute, value] = fields as [string, string, string, string, string];
    rows.push({ fips, state, areaName, attribute, value });
  }

  return rows;
}
