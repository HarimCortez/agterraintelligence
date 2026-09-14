import { normalizeCountyName, parseCensusLine } from "./nass-ag-census-client";

// Real lines captured from the live 2022 Census of Agriculture bulk file
// (nass.usda.gov/datasets/qs.census2022.txt.gz) while verifying this data
// source, not fabricated — see nass-ag-census-client.ts's doc comment.
const POLK_CATTLE_LINE =
  "CENSUS\tANIMALS & PRODUCTS\tLIVESTOCK\tCATTLE\tINCL CALVES\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tINVENTORY\tHEAD\tCATTLE, INCL CALVES - INVENTORY\tTOTAL\tNOT SPECIFIED\tCOUNTY\t12\t12\tFL\tFLORIDA\t50\tCENTRAL\t105\t105\tPOLK\t\t\t00000000\t\t\t9000\tUNITED STATES\tFLORIDA, CENTRAL, POLK\t2022\tPOINT IN TIME\t12\t12\tEND OF DEC\t\t2024-02-13 12:00:00\t109,225\t(L)";

const DE_SOTO_LAND_VALUE_LINE =
  "CENSUS\tECONOMICS\tFARMS & LAND & ASSETS\tAG LAND\tINCL BUILDINGS\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tASSET VALUE\t$ / ACRE\tAG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE\tTOTAL\tNOT SPECIFIED\tCOUNTY\t12\t12\tFL\tFLORIDA\t80\tSOUTHERN\t027\t027\tDE SOTO\t\t\t00000000\t\t\t9000\tUNITED STATES\tFLORIDA, SOUTHERN, DE SOTO\t2022\tPOINT IN TIME\t12\t12\tEND OF DEC\t\t2024-02-13 12:00:00\t6,531\t(L)";

const POLK_LAND_VALUE_IRRIGATION_BREAKOUT_LINE =
  "CENSUS\tECONOMICS\tFARMS & LAND & ASSETS\tAG LAND\tALL CLASSES\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tAREA\tACRES\tAG LAND - ACRES\tIRRIGATION STATUS\tIRRIGATION STATUS: (ANY ON OPERATION)\tCOUNTY\t12\t12\tFL\tFLORIDA\t50\tCENTRAL\t105\t105\tPOLK\t\t\t00000000\t\t\t9000\tUNITED STATES\tFLORIDA, CENTRAL, POLK\t2022\tANNUAL\t00\t00\tYEAR\t\t2024-02-13 12:00:00\t236,799\t(L)";

const ALABAMA_COTTON_LINE =
  "CENSUS\tCROPS\tFIELD CROPS\tCOTTON\tALL CLASSES\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tAREA HARVESTED\tACRES\tCOTTON - ACRES HARVESTED\tTOTAL\tNOT SPECIFIED\tCOUNTY\t01\t01\tAL\tALABAMA\t10\tNORTHERN VALLEY\t033\t033\tCOLBERT\t\t\t00000000\t\t\t9000\tUNITED STATES\tALABAMA, NORTHERN VALLEY, COLBERT\t2002\tANNUAL\t00\t00\tYEAR\t\t2012-01-01 00:00:00\t24,598\t";

const WITHHELD_VALUE_LINE =
  "CENSUS\tANIMALS & PRODUCTS\tLIVESTOCK\tCATTLE\tINCL CALVES\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tINVENTORY\tHEAD\tCATTLE, INCL CALVES - INVENTORY\tTOTAL\tNOT SPECIFIED\tCOUNTY\t12\t12\tFL\tFLORIDA\t50\tCENTRAL\t999\t999\tSOMECOUNTY\t\t\t00000000\t\t\t9000\tUNITED STATES\tFLORIDA, CENTRAL, SOMECOUNTY\t2022\tPOINT IN TIME\t12\t12\tEND OF DEC\t\t2024-02-13 12:00:00\t(D)\t";

const STATE_LEVEL_ORANGES_LINE =
  "SURVEY\tCROPS\tFRUIT & TREE NUTS\tORANGES\tALL CLASSES\tALL PRODUCTION PRACTICES\tALL UTILIZATION PRACTICES\tYIELD\tBOXES / ACRE\tORANGES - YIELD, MEASURED IN BOXES / ACRE\tTOTAL\tNOT SPECIFIED\tSTATE\t12\t12\tFL\tFLORIDA\t\t\t\t\t\t\t\t\t\t9000\tUNITED STATES\tFLORIDA\t2024\tANNUAL\t00\t00\tYEAR\t\t2024-10-11 12:00:00\t210\t";

describe("normalizeCountyName", () => {
  it("matches NASS's 'DE SOTO' spelling against this project's 'DeSoto'", () => {
    expect(normalizeCountyName("DE SOTO")).toBe(normalizeCountyName("DeSoto"));
  });

  it("is a no-op for counties that already match once uppercased", () => {
    expect(normalizeCountyName("Polk")).toBe(normalizeCountyName("POLK"));
  });
});

describe("parseCensusLine", () => {
  it("parses a real cattle inventory line", () => {
    const result = parseCensusLine(POLK_CATTLE_LINE);
    expect(result).toEqual({ normalizedCounty: "POLK", metric: "cattle", value: 109225 });
  });

  it("parses a real land value line for a county whose NASS spelling differs from ours", () => {
    const result = parseCensusLine(DE_SOTO_LAND_VALUE_LINE);
    expect(result).toEqual({ normalizedCounty: normalizeCountyName("DeSoto"), metric: "landValue", value: 6531 });
  });

  it("ignores a real row for the same short_desc family but a different (irrigation-breakout) domain, not the tracked 'TOTAL' domain", () => {
    expect(parseCensusLine(POLK_LAND_VALUE_IRRIGATION_BREAKOUT_LINE)).toBeNull();
  });

  it("ignores commodities/metrics outside the two tracked short_desc values", () => {
    expect(parseCensusLine(ALABAMA_COTTON_LINE)).toBeNull();
  });

  it("returns null for a NASS disclosure-withheld value ('(D)') rather than parsing it as a number", () => {
    expect(parseCensusLine(WITHHELD_VALUE_LINE)).toBeNull();
  });

  it("ignores non-Florida rows even when the short_desc and domain match", () => {
    expect(parseCensusLine(ALABAMA_COTTON_LINE.replace("COTTON - ACRES HARVESTED", "CATTLE, INCL CALVES - INVENTORY"))).toBeNull();
  });

  it("ignores STATE-level rows even when they'd otherwise match (confirms county-only scoping)", () => {
    expect(parseCensusLine(STATE_LEVEL_ORANGES_LINE)).toBeNull();
  });

  it("returns null for a malformed line with too few fields", () => {
    expect(parseCensusLine("CENSUS\tTOO\tFEW\tFIELDS")).toBeNull();
  });
});
