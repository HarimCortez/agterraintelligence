import { Injectable, Logger } from "@nestjs/common";
import * as XLSX from "xlsx";
import { normalizeCountyName } from "./ers-county-economic-client";

/**
 * Real USDA FSA "CRP Practices by County" report — confirmed live 2026-09-17
 * at `fsa.usda.gov/tools/informational/reports/conservation-statistics/crp`,
 * linking to a genuine downloadable Excel workbook
 * (`CRP_COUNTY_PRACTICE.xlsx`, confirmed via HEAD request: HTTP 200,
 * `content-length: 580555`, `content-type:
 * application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
 * `last-modified: Wed, 25 Oct 2023`). This host was previously unreachable
 * from this environment (see project memory) and is now confirmed working —
 * the twenty-eighth ingestion source in this module, and the first genuinely
 * Excel-only one (every prior USDA bulk-file source here is plain CSV,
 * hand-parsed with a quote-aware splitter; this file needed the `xlsx`
 * (SheetJS) package instead of a hand-rolled parser).
 *
 * The real downloaded workbook (single sheet, `Sheet1`, 2,526 rows x 45
 * columns) is a fixed-layout report, not a normal tabular CSV:
 * - Row 1 (`A1`): report title, "CONSERVATION PRACTICES INSTALLED ON CRP
 *   (ACRES)".
 * - Row 2 (`A2`): the report's real vintage label, e.g. "CUMULATIVE, AS OF
 *   JANUARY 2017" — captured verbatim as `reportPeriod` below rather than
 *   parsed into a date, since this is a periodically-republished cumulative
 *   snapshot, not a live time series. Note this is genuinely older than the
 *   file's own HTTP `Last-Modified` header (Oct 2023) — USDA re-uploads the
 *   file (bumping `Last-Modified`) without necessarily refreshing the
 *   underlying cumulative snapshot's own stated as-of date, so the header
 *   is not a substitute for this row.
 * - Row 3: blank.
 * - Rows 4-5 (`A4:AS5`, 0-indexed 3-4 below): a two-row merged-cell header —
 *   `FIPS`/`STATE`/`COUNTY` in the first three columns, then 41 CRP
 *   conservation-practice columns (grouped under a shared category label in
 *   row 4 for some columns, e.g. "GRASS PLANTINGS" spanning "INTROD. (CP1)"
 *   and "NATIVE (CP2)" in row 5), then a final "TOTAL" column.
 * - Data rows (0-indexed 5 onward): one row per U.S. county (all 50 states
 *   + territories, 2,510 real county rows), FIPS/STATE/COUNTY then a
 *   cumulative-acres figure (or blank) per practice column, then the
 *   county's TOTAL.
 * - Trailing rows: a real "TOTALS:" summary row, a blank row, then eight
 *   numbered footnote rows (free text in column A only) — not data, and
 *   terminated on by this parser (see `fetchFloridaCountyResults` below)
 *   rather than a hardcoded row count.
 *
 * A real column-header quirk found while verifying live: `(CP3A)` appears
 * twice as a practice code (columns for "LONGLEAF PINE (CP3A)" and
 * "HARDWOODS (CP3A)" under "TREE PLANTINGS"), and `(CP23)` appears twice
 * similarly (under "WETLAND RESTORATION", once bare and once under
 * "FLOODPLAIN (CP23)"). `practiceCode` alone is therefore not a reliable
 * per-column identifier — `PRACTICE_COLUMNS` below carries a full,
 * disambiguated `label` (category + sub-label, source footnote markers
 * like "1/"/"6/" stripped) for every column, and `PropertyCrpEnrollment`'s
 * unique constraint is keyed on that `label`, not `practiceCode`.
 *
 * Matched to `properties` by county name, Florida only — same convention
 * as `ErsCountyEconomicClient`/`FiaTimberClient`/etc. A real, honest
 * finding from inspecting the actual downloaded file: Florida has 15
 * counties with any CRP practice acreage at all, and every one of them is
 * a Panhandle county (Holmes, Jackson, Walton, Santa Rosa, Escambia,
 * Okaloosa, Washington, Jefferson, Madison, Gadsden, Leon, Calhoun,
 * Columbia, Gulf, Hamilton) — none of which are among this project's
 * current seed counties (Polk, Highlands, Okeechobee, DeSoto, Hardee), so
 * a run against today's seed data creates zero real rows. This is the same
 * real-source-genuinely-sparse-for-this-property-set outcome already
 * documented on `UsdaForestHealthIngestionService`'s doc comment for a
 * different source — not a bug, and not a reason to fabricate a match.
 *
 * Column layout is verified once at parse time against the real header
 * cells (`validateWorkbookStructure` below) rather than trusted blindly —
 * on any structural mismatch (wrong column count, unexpected `FIPS`
 * header, etc.) this client logs a warning and returns no results rather
 * than risk silently misaligning a future re-download against a changed
 * layout.
 */
const FILE_URL = "https://www.fsa.usda.gov/sites/default/files/documents/CRP_COUNTY_PRACTICE.xlsx";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const TITLE_ROW_INDEX = 0;
const REPORT_PERIOD_ROW_INDEX = 1;
const HEADER_ROW_INDEX = 3;
const DATA_START_ROW_INDEX = 5;
const FIPS_COL = 0;
const STATE_COL = 1;
const COUNTY_COL = 2;

interface PracticeColumn {
  index: number;
  label: string;
  code: string | null;
  /** True only for the file's own "TOTAL (ALL PRACTICES)" column — its value is the sum of the other 41 practice columns for that county, so it must be tagged distinguishably rather than stored as an indistinguishable practice row (see `PropertyCrpEnrollment.isTotal`). */
  isTotal?: boolean;
}

/**
 * The 41 real CRP practice columns plus the file's own "TOTAL" column, read
 * directly off the real downloaded workbook's row 4/row 5 header cells
 * (0-indexed rows 3/4) — see this file's doc comment for the two real
 * `(CP3A)`/`(CP23)` code collisions this disambiguates via `label`.
 */
const PRACTICE_COLUMNS: PracticeColumn[] = [
  { index: 3, label: "GRASS PLANTINGS - INTROD. (CP1)", code: "CP1" },
  { index: 4, label: "GRASS PLANTINGS - NATIVE (CP2)", code: "CP2" },
  { index: 5, label: "TREE PLANTINGS - SOFTWOODS (CP3)", code: "CP3" },
  { index: 6, label: "TREE PLANTINGS - LONGLEAF PINE (CP3A)", code: "CP3A" },
  { index: 7, label: "TREE PLANTINGS - HARDWOODS (CP3A)", code: "CP3A" },
  { index: 8, label: "WILDLIFE HABITAT (CP4D)", code: "CP4D" },
  { index: 9, label: "WILDLIFE CORRIDORS (CP4B)", code: "CP4B" },
  { index: 10, label: "FIELD WINDBREAKS (CP5)", code: "CP5" },
  { index: 11, label: "DIVERSIONS & EROSION CONTROL STRUC. (CP6&CP7)", code: "CP6&CP7" },
  { index: 12, label: "GRASS WATERWAYS (CP8)", code: "CP8" },
  { index: 13, label: "SHALLOW WATER FOR WILDLIFE (CP9)", code: "CP9" },
  { index: 14, label: "EXISTING GRASS (CP10)", code: "CP10" },
  { index: 15, label: "EXISTING TREES (CP11)", code: "CP11" },
  { index: 16, label: "WILDLIFE FOOD PLOTS (CP12)", code: "CP12" },
  { index: 17, label: "CONTOUR GRASS STRIPS (CP15)", code: "CP15" },
  { index: 18, label: "SHELTER-BELTS (CP16)", code: "CP16" },
  { index: 19, label: "LIVING SNOW FENCES (CP17)", code: "CP17" },
  { index: 20, label: "SALINITY REDUCING VEGETATION (CP18)", code: "CP18" },
  { index: 21, label: "FILTER-STRIPS (CP21)", code: "CP21" },
  { index: 22, label: "RIPARIAN BUFFERS (CP22)", code: "CP22" },
  { index: 23, label: "WETLAND RESTORATION (CP23)", code: "CP23" },
  { index: 24, label: "WETLAND RESTORATION - FLOODPLAIN (CP23)", code: "CP23" },
  { index: 25, label: "WETLAND RESTORATION - NON-FLOODPLAIN (CP23A)", code: "CP23A" },
  { index: 26, label: "CROSS WIND TRAP STRIPS (CP24)", code: "CP24" },
  { index: 27, label: "RARE AND DECLINING HABITAT (CP25)", code: "CP25" },
  { index: 28, label: "FARMABLE WETLAND PROGRAM - WETLAND (CP27)", code: "CP27" },
  { index: 29, label: "FARMABLE WETLAND PROGRAM - BUFFER (CP28)", code: "CP28" },
  { index: 30, label: "MARGINAL PASTURE BUFFERS - WILDLIFE (CP29)", code: "CP29" },
  { index: 31, label: "MARGINAL PASTURE BUFFERS - WETLAND (CP30)", code: "CP30" },
  { index: 32, label: "BOTTOMLAND HARDWOOD TREES (CP31)", code: "CP31" },
  { index: 33, label: "EXPIRED HARDWOOD TREES (CP32)", code: "CP32" },
  { index: 34, label: "UPLAND BIRD HABITAT BUFFERS (CP33)", code: "CP33" },
  { index: 35, label: "LONGLEAF PINE (CP36)", code: "CP36" },
  { index: 36, label: "DUCK NESTING HABITAT (CP37)", code: "CP37" },
  { index: 37, label: "STATE ACRES FOR WILDLIFE ENHANCEMENT (CP38)", code: "CP38" },
  { index: 38, label: "FARMABLE WETLAND PROGRAM - CONSTRUCTED WETLANDS (CP39)", code: "CP39" },
  { index: 39, label: "FARMABLE WETLAND PROGRAM - AQUACULTURE WETLANDS (CP40)", code: "CP40" },
  { index: 40, label: "FARMABLE WETLAND PROGRAM - FLOODED PRAIRIE WETLANDS (CP41)", code: "CP41" },
  { index: 41, label: "POLLINATOR HABITAT (CP42)", code: "CP42" },
  { index: 42, label: "CRP GRASSLANDS - INTRODUCED GRASSES (CP87)", code: "CP87" },
  { index: 43, label: "CRP GRASSLANDS - NATIVE GRASSES (CP88)", code: "CP88" },
  { index: 44, label: "TOTAL (ALL PRACTICES)", code: "TOTAL", isTotal: true },
];

export interface CrpPracticeResult {
  reportPeriod: string;
  practiceLabel: string;
  practiceCode: string | null;
  acres: number;
  isTotal: boolean;
}

@Injectable()
export class CrpCountyPracticeClient {
  private readonly logger = new Logger(CrpCountyPracticeClient.name);

  /**
   * Downloads and parses the real workbook once, returning a lookup keyed by
   * normalized Florida county name to that county's list of real,
   * non-blank practice acreage figures. See this class's doc comment for
   * why the real current result is an empty map for this project's current
   * seed counties (Panhandle-concentrated CRP participation).
   */
  async fetchFloridaCountyResults(): Promise<Map<string, CrpPracticeResult[]>> {
    const results = new Map<string, CrpPracticeResult[]>();

    let rows: unknown[][];
    try {
      const response = await fetch(FILE_URL, { headers: { "User-Agent": BROWSER_USER_AGENT } });
      if (!response.ok) {
        this.logger.warn(`USDA FSA CRP county practice request returned HTTP ${response.status}`);
        return results;
      }
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!worksheet) {
        this.logger.warn("USDA FSA CRP county practice workbook has no sheets");
        return results;
      }
      rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
        defval: null,
      }) as unknown[][];
    } catch (error) {
      this.logger.warn(
        `USDA FSA CRP county practice fetch/parse failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return results;
    }

    const structureCheck = validateWorkbookStructure(rows);
    if (!structureCheck.ok) {
      this.logger.warn(
        `USDA FSA CRP county practice workbook structure mismatch (${structureCheck.reason}) — refusing to guess-parse`,
      );
      return results;
    }
    const reportPeriod = structureCheck.reportPeriod;

    for (let i = DATA_START_ROW_INDEX; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const fips = toFiniteNumber(row[FIPS_COL]);
      if (fips === null) {
        // Real workbook: the "TOTALS:" row and trailing footnote rows have
        // a non-numeric (or blank) FIPS cell — this is the real, honest end
        // of the county data, not a hardcoded row count.
        break;
      }

      const state = typeof row[STATE_COL] === "string" ? (row[STATE_COL] as string).trim().toUpperCase() : "";
      if (state !== "FLORIDA") continue;

      const countyRaw = typeof row[COUNTY_COL] === "string" ? (row[COUNTY_COL] as string) : "";
      const county = normalizeCountyName(countyRaw);
      if (!county) continue;

      const practices: CrpPracticeResult[] = [];
      for (const column of PRACTICE_COLUMNS) {
        const acres = toFiniteNumber(row[column.index]);
        if (acres === null) continue;
        practices.push({
          reportPeriod,
          practiceLabel: column.label,
          practiceCode: column.code,
          acres: Math.round(acres * 100) / 100,
          isTotal: column.isTotal ?? false,
        });
      }

      if (practices.length > 0) {
        results.set(county, practices);
      }
    }

    return results;
  }
}

type StructureCheck = { ok: true; reportPeriod: string } | { ok: false; reason: string };

/**
 * Validates the real, known layout of this specific workbook before
 * trusting `PRACTICE_COLUMNS`' hardcoded column indices — see this file's
 * doc comment. Exported standalone for direct unit testing.
 */
export function validateWorkbookStructure(rows: unknown[][]): StructureCheck {
  const titleRow = rows[TITLE_ROW_INDEX];
  const titleCell = typeof titleRow?.[0] === "string" ? titleRow[0] : "";
  if (!/CONSERVATION\s+PRACTICES\s+INSTALLED\s+ON\s+CRP/i.test(titleCell)) {
    return { ok: false, reason: `unexpected title row: "${titleCell}"` };
  }

  const reportPeriodRow = rows[REPORT_PERIOD_ROW_INDEX];
  const reportPeriod = typeof reportPeriodRow?.[0] === "string" ? reportPeriodRow[0].trim() : "";
  if (!reportPeriod) {
    return { ok: false, reason: "missing report-period row" };
  }

  const headerRow = rows[HEADER_ROW_INDEX];
  const fipsHeader = typeof headerRow?.[FIPS_COL] === "string" ? (headerRow[FIPS_COL] as string).trim() : "";
  const stateHeader = typeof headerRow?.[STATE_COL] === "string" ? (headerRow[STATE_COL] as string).trim() : "";
  const countyHeader = typeof headerRow?.[COUNTY_COL] === "string" ? (headerRow[COUNTY_COL] as string).trim() : "";
  const totalHeader =
    typeof headerRow?.[PRACTICE_COLUMNS[PRACTICE_COLUMNS.length - 1]!.index] === "string"
      ? (headerRow[PRACTICE_COLUMNS[PRACTICE_COLUMNS.length - 1]!.index] as string).trim()
      : "";

  if (fipsHeader.toUpperCase() !== "FIPS" || stateHeader.toUpperCase() !== "STATE" || countyHeader.toUpperCase() !== "COUNTY") {
    return { ok: false, reason: `unexpected FIPS/STATE/COUNTY headers: "${fipsHeader}"/"${stateHeader}"/"${countyHeader}"` };
  }
  if (totalHeader.toUpperCase() !== "TOTAL") {
    return { ok: false, reason: `unexpected final column header: "${totalHeader}"` };
  }

  return { ok: true, reportPeriod };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
