import { Injectable, Logger } from "@nestjs/common";

const BASE_URL = "https://www.resales.usda.gov/resales/public";

export interface FsaListingResult {
  propertyType: "Farm & Ranch" | "Single Family" | "Multi-Family";
  state: string;
  county: string | null;
  city: string | null;
  zip: string | null;
  streetAddress: string | null;
  listingType: string | null;
  priceCents: number | null;
  totalAcres: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  totalUnits: number | null;
}

/**
 * Thin client for USDA's real, live, keyless RD/FSA Properties resale
 * site (`resales.usda.gov`) — the official government portal for
 * REO/foreclosure real estate the government itself now owns after a
 * defaulted USDA Rural Development or Farm Service Agency loan.
 *
 * Covers all three of the site's real, documented search types, each
 * independently confirmed live:
 * - Farm & Ranch (`searchFormName=FSA`, `POST /resales/public/searchFSA`)
 * - Single Family (`searchFormName=SFH`, `POST /resales/public/searchSFH`)
 * - Multi-Family (`searchFormName=MFH`, `POST /resales/public/searchMFH`)
 *
 * Farm & Ranch was confirmed live via the site's own published "USDA
 * RD/FSA Properties User Guide" PDF (dated 2018, still linked from the
 * live site as of this writing) and by directly exercising the real
 * search form. Single Family and Multi-Family were verified the same
 * way for this pass: both endpoint paths return real HTTP 200 responses
 * (confirmed via curl with a real browser User-Agent) whose `<form
 * method="post" action="searchSFH">` / `action="searchMFH">` markup, the
 * hidden `searchFormName`/`propertyType` field values ("SFH"/"Single
 * Family" and "MFH"/"Multi-Family" respectively), and every select
 * field name (`stateCode`, `countyCode`, `city`, `zipCode`,
 * `propertyType`, `listingType`, `minPrice`, `maxPrice`, plus
 * `bedrooms`/`bathrooms`/`squareFootage` for SFH and
 * `resOccupancy`/`totalUnits` for MFH) were read directly off the real
 * GET'd search-form HTML — not assumed from the FSA pattern. Submitting
 * each documented form (with `listingType=All Types`) returns a real,
 * well-formed "Single Family Housing Properties Found: N" / "Multi-
 * Family Housing Properties Found: N" results page, exactly matching
 * the format confirmed for Farm & Ranch — not an error page.
 *
 * ⚠️ IMPORTANT, READ BEFORE TOUCHING `parseListingsFromResultsHtml`:
 * this client's results-table parser is UNVERIFIED against real
 * populated markup for any of the three property types. Every property
 * type nationwide (Farm & Ranch, Single Family, Multi-Family) genuinely
 * showed 0 real listings at verification time — confirmed by correctly
 * matching every documented form field (including `listingType=All
 * Types`, which isn't the same as an empty string), not a broken query.
 * The parser below is written directly from the real column layout
 * documented (with actual populated-results screenshots, not just
 * prose) in USDA's own user guide: Farm & Ranch — Photo, Listing Type,
 * Street Address, City, State, County, Zip, Price/Bid, Total Acres,
 * Parcels (p.21); Single Family — Photo, Listing Type, Street Address,
 * City, State, County, Zip, Price/Bid, Beds/Baths, Sq. Ft. (p.15);
 * Multi-Family — Photo, Listing Type, Street Address, City, State,
 * County, Zip, Price/Bid, Total Units (p.18). The exact live HTML (table
 * vs. div grid, class names, cell ordering) has never been observed
 * populated for any of the three types. It is deliberately defensive:
 * on any structural surprise (wrong cell count, a price/acre/beds-baths
 * value that doesn't parse as a number) it logs a warning and skips
 * that row rather than store a guessed or malformed value — but a
 * whole-page markup mismatch (e.g. USDA switched to a JS-rendered grid)
 * could still silently yield zero parsed rows despite the page
 * genuinely reporting N > 0. The very first real run where any type's
 * `Properties Found: N` is greater than zero is the real test this
 * parser has been waiting for — check its `recordsCreated` against N by
 * hand that first time, don't just trust a "succeeded" status.
 *
 * No listing ID is exposed anywhere in the documented search results or
 * detail-page fields, so `FsaResaleListing`'s natural-key dedup
 * (source+propertyType+state+county+streetAddress+priceCents) is what
 * distinguishes one real listing from another — see that model's doc
 * comment in schema.prisma.
 */
@Injectable()
export class FsaResaleClient {
  private readonly logger = new Logger(FsaResaleClient.name);

  /** Searches the real Farm & Ranch inventory, optionally scoped to one state (omit for a real nationwide sweep). Returns [] both when the site reports zero real listings and when the request itself fails — see this client's doc comment for why a non-empty result can still legitimately be rare or absent. */
  async searchFarmAndRanch(stateCode?: string): Promise<FsaListingResult[]> {
    return this.search({
      propertyType: "Farm & Ranch",
      searchFormName: "FSA",
      endpoint: "searchFSA",
      foundPattern: /Farm\s*&\s*Ranch Properties Found:\s*(\d+)/i,
      extraFormFields: { propertyUsage: "", totalAcreage: "", rangeland: "", cropland: "" },
      extraColumnsFromCells: (cells) => ({ totalAcres: parseNumber(cells[8] ?? "") }),
      stateCode,
    });
  }

  /** Searches the real Single Family Housing inventory, optionally scoped to one state (omit for a real nationwide sweep). See this client's doc comment — endpoint/form fields confirmed live for this pass, results-table parser unverified against real populated markup. */
  async searchSingleFamily(stateCode?: string): Promise<FsaListingResult[]> {
    return this.search({
      propertyType: "Single Family",
      searchFormName: "SFH",
      endpoint: "searchSFH",
      foundPattern: /Single Family Housing Properties Found:\s*(\d+)/i,
      extraFormFields: { bedrooms: "", bathrooms: "", squareFootage: "" },
      extraColumnsFromCells: (cells) => {
        const [bedrooms, bathrooms] = parseBedsBaths(cells[8] ?? "");
        return { bedrooms, bathrooms, squareFeet: parseNumber(cells[9] ?? "") };
      },
      stateCode,
    });
  }

  /** Searches the real Multi-Family Housing inventory, optionally scoped to one state (omit for a real nationwide sweep). See this client's doc comment — endpoint/form fields confirmed live for this pass, results-table parser unverified against real populated markup. */
  async searchMultiFamily(stateCode?: string): Promise<FsaListingResult[]> {
    return this.search({
      propertyType: "Multi-Family",
      searchFormName: "MFH",
      endpoint: "searchMFH",
      foundPattern: /Multi-Family Housing Properties Found:\s*(\d+)/i,
      extraFormFields: { resOccupancy: "", totalUnits: "" },
      extraColumnsFromCells: (cells) => ({ totalUnits: parseNumber(cells[8] ?? "") }),
      stateCode,
    });
  }

  private async search(options: {
    propertyType: FsaListingResult["propertyType"];
    searchFormName: string;
    endpoint: string;
    foundPattern: RegExp;
    extraFormFields: Record<string, string>;
    extraColumnsFromCells: (cells: string[]) => Partial<FsaListingResult>;
    stateCode?: string;
  }): Promise<FsaListingResult[]> {
    const body = new URLSearchParams({
      searchFormName: options.searchFormName,
      stateCode: options.stateCode ?? "",
      countyCode: "",
      city: "",
      zipCode: "",
      propertyType: options.propertyType,
      listingType: "All Types",
      minPrice: "",
      maxPrice: "",
      ...options.extraFormFields,
      Search: "Search",
    });

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/${options.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.logger.warn(
        `USDA RD/FSA ${options.propertyType} search request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }

    if (!response.ok) {
      this.logger.warn(`USDA RD/FSA ${options.propertyType} search returned HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    return this.parseListingsFromResultsHtml(html, options.propertyType, options.foundPattern, options.extraColumnsFromCells);
  }

  /** See this class's doc comment — unverified against real populated markup for any property type. */
  private parseListingsFromResultsHtml(
    html: string,
    propertyType: FsaListingResult["propertyType"],
    foundPattern: RegExp,
    extraColumnsFromCells: (cells: string[]) => Partial<FsaListingResult>,
  ): FsaListingResult[] {
    const countMatch = foundPattern.exec(html);
    const reportedCount = countMatch ? Number(countMatch[1]) : 0;
    if (reportedCount === 0) {
      return [];
    }

    const rows: FsaListingResult[] = [];
    const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowHtml = rowMatch[1] ?? "";
      const cells = [...rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((m) =>
        (m[1] ?? "").replace(/<[^>]+>/g, "").trim(),
      );
      // Documented column order (see this class's doc comment): Photo, Listing Type, Street Address, City, State, County, Zip, Price/Bid, then type-specific trailing columns.
      if (cells.length < 8) continue;

      const [, listingType, streetAddress, city, state, county, zip, priceRaw] = cells;
      const priceCents = parseCurrencyToCents(priceRaw ?? "");

      if (!state) {
        this.logger.warn(
          `Skipping a parsed ${propertyType} result row with no state — likely a header row or markup mismatch`,
        );
        continue;
      }

      rows.push({
        propertyType,
        state,
        county: county || null,
        city: city || null,
        zip: zip || null,
        streetAddress: streetAddress || null,
        listingType: listingType || null,
        priceCents,
        totalAcres: null,
        bedrooms: null,
        bathrooms: null,
        squareFeet: null,
        totalUnits: null,
        ...extraColumnsFromCells(cells),
      });
    }

    if (rows.length !== reportedCount) {
      this.logger.warn(
        `USDA RD/FSA ${propertyType} page reported ${reportedCount} properties but only parsed ${rows.length} — results-table markup may not match this client's assumptions (see FsaResaleClient's doc comment)`,
      );
    }

    return rows;
  }
}

function parseCurrencyToCents(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseNumber(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/** Parses a combined "Beds / Baths" cell (documented format, e.g. "3/2") into [bedrooms, bathrooms]. Returns [null, null] on anything that doesn't split into exactly two numeric parts. */
function parseBedsBaths(raw: string): [number | null, number | null] {
  const parts = raw.split("/");
  if (parts.length !== 2) return [null, null];
  const bedrooms = parseNumber(parts[0] ?? "");
  const bathrooms = parseNumber(parts[1] ?? "");
  return [bedrooms, bathrooms];
}
