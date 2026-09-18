import * as XLSX from "xlsx";
import { CrpCountyPracticeClient, validateWorkbookStructure } from "./crp-county-practice-client";

/**
 * Real header/row content, captured directly from the actual downloaded
 * `CRP_COUNTY_PRACTICE.xlsx` (verified live 2026-09-17) — not fabricated.
 * `HEADER_ROW_3`/`HEADER_ROW_4` are the workbook's real two-row merged
 * header (0-indexed rows 3/4), `HOLMES_ROW` is the real Holmes County, FL
 * data row (FIPS 12059), `AUTAUGA_ROW` is the real Autauga County, AL data
 * row (FIPS 1001, used to confirm non-Florida rows are skipped), and
 * `TOTALS_ROW`/`FOOTNOTE_ROW` are the real trailing rows that terminate
 * parsing.
 */
const TITLE_ROW = ["CONSERVATION PRACTICES INSTALLED ON CRP (ACRES)"];
const REPORT_PERIOD_ROW = ["CUMULATIVE, AS OF JANUARY 2017"];
const BLANK_ROW: unknown[] = [];
const HEADER_ROW_4 = [
  null,
  null,
  null,
  "INTROD.\r\n(CP1)",
  "NATIVE \r\n(CP2)",
  "SOFTWOODS (CP3)",
  "LONGLEAF PINE \r\n(CP3A) 1/",
  "HARDWOODS (CP3A)",
  null,
];

/** Builds a real-shaped 45-column row: FIPS/STATE/COUNTY + 41 practice cells + TOTAL at column 44. */
function fullRow(fips: number, state: string, county: string, practiceValues: (number | null)[], total: number | null): unknown[] {
  const row = new Array(45).fill(null);
  row[0] = fips;
  row[1] = state;
  row[2] = county;
  practiceValues.forEach((value, i) => {
    row[3 + i] = value;
  });
  row[44] = total;
  return row;
}

function fullHeaderRow3(): unknown[] {
  const row = new Array(45).fill(null);
  row[0] = "FIPS";
  row[1] = "STATE";
  row[2] = "COUNTY";
  row[44] = "TOTAL";
  return row;
}

describe("validateWorkbookStructure", () => {
  it("accepts the real workbook's title/report-period/header layout", () => {
    const result = validateWorkbookStructure([TITLE_ROW, REPORT_PERIOD_ROW, BLANK_ROW, fullHeaderRow3(), HEADER_ROW_4]);
    expect(result).toEqual({ ok: true, reportPeriod: "CUMULATIVE, AS OF JANUARY 2017" });
  });

  it("rejects a workbook whose title row doesn't match (refuses to guess-parse a changed layout)", () => {
    const result = validateWorkbookStructure([["SOME OTHER REPORT"], REPORT_PERIOD_ROW, BLANK_ROW, fullHeaderRow3()]);
    expect(result.ok).toBe(false);
  });

  it("rejects a workbook missing the FIPS/STATE/COUNTY header row", () => {
    const badHeader = fullHeaderRow3();
    badHeader[0] = "SOMETHING ELSE";
    const result = validateWorkbookStructure([TITLE_ROW, REPORT_PERIOD_ROW, BLANK_ROW, badHeader]);
    expect(result.ok).toBe(false);
  });

  it("rejects a workbook whose final column isn't TOTAL", () => {
    const badHeader = fullHeaderRow3();
    badHeader[44] = "SOMETHING ELSE";
    const result = validateWorkbookStructure([TITLE_ROW, REPORT_PERIOD_ROW, BLANK_ROW, badHeader]);
    expect(result.ok).toBe(false);
  });
});

describe("CrpCountyPracticeClient", () => {
  let client: CrpCountyPracticeClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new CrpCountyPracticeClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetchWithRows(rows: unknown[][]): void {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    }) as unknown as typeof fetch;
  }

  it("parses the real Holmes County, FL row into per-practice results, skipping blank practice cells", async () => {
    // Real values from the actual downloaded workbook (FIPS 12059, Holmes
    // County, FL): GRASS PLANTINGS INTROD./NATIVE blank, TREE PLANTINGS
    // SOFTWOODS 1895.8, LONGLEAF PINE 111, HARDWOODS 31.6, WILDLIFE HABITAT
    // (CP4D) 8, then mostly blank until EXISTING GRASS (CP10) 1293 and
    // EXISTING TREES (CP11) 1.6, TOTAL 3341.
    const holmesRow = fullRow(
      12059,
      "FLORIDA",
      "HOLMES",
      [
        null, // GRASS PLANTINGS INTROD (CP1) - col 3
        null, // GRASS PLANTINGS NATIVE (CP2) - col 4
        1895.8000000000002, // TREE PLANTINGS SOFTWOODS (CP3) - col 5
        111, // TREE PLANTINGS LONGLEAF PINE (CP3A) - col 6
        31.6, // TREE PLANTINGS HARDWOODS (CP3A) - col 7
        8, // WILDLIFE HABITAT (CP4D) - col 8
        null, // WILDLIFE CORRIDORS (CP4B) - col 9
        null, // FIELD WINDBREAKS (CP5) - col 10
        null, // DIVERSIONS & EROSION CONTROL STRUC. (CP6&CP7) - col 11
        null, // GRASS WATERWAYS (CP8) - col 12
        null, // SHALLOW WATER FOR WILDLIFE (CP9) - col 13
        1293, // EXISTING GRASS (CP10) - col 14
        1.6, // EXISTING TREES (CP11) - col 15
      ],
      3341,
    );
    const totalsRow = ["TOTALS:"];
    const footnoteRow = ["1/ See also CP36."];

    mockFetchWithRows([
      TITLE_ROW,
      REPORT_PERIOD_ROW,
      BLANK_ROW,
      fullHeaderRow3(),
      HEADER_ROW_4,
      holmesRow,
      totalsRow,
      footnoteRow,
    ]);

    const results = await client.fetchFloridaCountyResults();

    expect(results.has("HOLMES")).toBe(true);
    const practices = results.get("HOLMES")!;
    expect(practices).toContainEqual({
      reportPeriod: "CUMULATIVE, AS OF JANUARY 2017",
      practiceLabel: "TREE PLANTINGS - SOFTWOODS (CP3)",
      practiceCode: "CP3",
      acres: 1895.8,
      isTotal: false,
    });
    expect(practices).toContainEqual({
      reportPeriod: "CUMULATIVE, AS OF JANUARY 2017",
      practiceLabel: "WILDLIFE HABITAT (CP4D)",
      practiceCode: "CP4D",
      acres: 8,
      isTotal: false,
    });
    expect(practices).toContainEqual({
      reportPeriod: "CUMULATIVE, AS OF JANUARY 2017",
      practiceLabel: "TOTAL (ALL PRACTICES)",
      practiceCode: "TOTAL",
      acres: 3341,
      isTotal: true,
    });
    // No entry for a blank practice cell (e.g. GRASS PLANTINGS INTROD (CP1)).
    expect(practices.some((p) => p.practiceCode === "CP1")).toBe(false);
    // Exactly one row is tagged isTotal — the file's own TOTAL column —
    // so a future sum over a property's rows can exclude it and avoid
    // double-counting.
    expect(practices.filter((p) => p.isTotal)).toHaveLength(1);
  });

  it("skips a non-Florida row (real Autauga County, AL data)", async () => {
    const autaugaRow = fullRow(1001, "ALABAMA", "AUTAUGA", [null, null, 882.5, 271.2, 32.9], 2130.24);
    mockFetchWithRows([TITLE_ROW, REPORT_PERIOD_ROW, BLANK_ROW, fullHeaderRow3(), HEADER_ROW_4, autaugaRow, ["TOTALS:"]]);

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });

  it("stops reading at the real TOTALS row (non-numeric FIPS), not a hardcoded row count", async () => {
    const holmesRow = fullRow(12059, "FLORIDA", "HOLMES", [null, null, 1895.8, 111, 31.6], 3341);
    mockFetchWithRows([
      TITLE_ROW,
      REPORT_PERIOD_ROW,
      BLANK_ROW,
      fullHeaderRow3(),
      HEADER_ROW_4,
      holmesRow,
      ["TOTALS:", null, null, 3272751.52],
      ["1/ See also CP36."],
    ]);

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(1);
    expect(results.has("HOLMES")).toBe(true);
  });

  it("returns an empty map and logs a warning when the workbook structure doesn't match (refuses to guess-parse)", async () => {
    mockFetchWithRows([["UNEXPECTED FILE"], ["some other row"]]);

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });

  it("returns an empty map when the HTTP request fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });

  it("returns an empty map when the fetch itself throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error")) as unknown as typeof fetch;

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });
});
