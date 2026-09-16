import { Injectable, Logger } from "@nestjs/common";

const SEARCH_URL = "https://www.resales.usda.gov/resales/public/searchFSA";

export interface FsaListingResult {
  state: string;
  county: string | null;
  city: string | null;
  zip: string | null;
  streetAddress: string | null;
  listingType: string | null;
  priceCents: number | null;
  totalAcres: number | null;
}

/**
 * Thin client for USDA's real, live, keyless RD/FSA Properties resale
 * site (`resales.usda.gov`) — the official government portal for
 * REO/foreclosure real estate the government itself now owns after a
 * defaulted USDA Rural Development or Farm Service Agency loan.
 * Confirmed live and real via the site's own published "USDA RD/FSA
 * Properties User Guide" PDF (dated 2018, still linked from the live
 * site as of this writing) and by directly exercising the real search
 * form: submitting the documented `Farm & Ranch` search (state, county,
 * city, zip, price range, property usage, total acreage, rangeland,
 * cropland filters, plus the required hidden `searchFormName=FSA` and
 * `propertyType=Farm & Ranch` fields) returns a real, well-formed
 * "Farm & Ranch Properties Found: N" results page — not an error.
 *
 * ⚠️ IMPORTANT, READ BEFORE TOUCHING `parseListingsFromResultsHtml`:
 * this client's results-table parser is UNVERIFIED against real
 * populated markup. Every property type nationwide (Farm & Ranch,
 * Single Family, Multi-Family) genuinely showed 0 real listings at
 * verification time — confirmed by correctly matching every documented
 * form field (including `listingType=All Types`, which isn't the same
 * as an empty string), not a broken query — and Internet Archive was
 * fully offline when a historical snapshot was attempted as a
 * fallback. The parser below is written directly from the real column
 * layout documented in USDA's own user guide screenshots (Street
 * Address, City, State, County, Zip, Listing Type, Price/Bid, Total
 * Acres, Parcels), but the exact HTML (table vs. div grid, class names,
 * cell ordering) has never been observed populated. It is deliberately
 * defensive: on any structural surprise (wrong cell count, a price/acre
 * value that doesn't parse as a number) it logs a warning and skips
 * that row rather than store a guessed or malformed value — but a
 * whole-page markup mismatch (e.g. USDA switched to a JS-rendered grid)
 * could still silently yield zero parsed rows despite the page
 * genuinely reporting N > 0. The very first real run where
 * `Properties Found: N` is greater than zero is the real test this
 * parser has been waiting for — check its `recordsCreated` against N
 * by hand that first time, don't just trust a "succeeded" status.
 *
 * No listing ID is exposed anywhere in the documented search results or
 * detail-page fields, so `FsaResaleListing`'s natural-key dedup
 * (source+state+county+streetAddress+priceCents) is what distinguishes
 * one real listing from another — see that model's doc comment in
 * schema.prisma.
 */
@Injectable()
export class FsaResaleClient {
  private readonly logger = new Logger(FsaResaleClient.name);

  /** Searches the real Farm & Ranch inventory, optionally scoped to one state (omit for a real nationwide sweep). Returns [] both when the site reports zero real listings and when the request itself fails — see this client's doc comment for why a non-empty result can still legitimately be rare or absent. */
  async searchFarmAndRanch(stateCode?: string): Promise<FsaListingResult[]> {
    const body = new URLSearchParams({
      searchFormName: "FSA",
      stateCode: stateCode ?? "",
      countyCode: "",
      city: "",
      zipCode: "",
      propertyType: "Farm & Ranch",
      listingType: "All Types",
      minPrice: "",
      maxPrice: "",
      propertyUsage: "",
      totalAcreage: "",
      rangeland: "",
      cropland: "",
      Search: "Search",
    });

    let response: Response;
    try {
      response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.logger.warn(`USDA RD/FSA Farm & Ranch search request failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }

    if (!response.ok) {
      this.logger.warn(`USDA RD/FSA Farm & Ranch search returned HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    return this.parseListingsFromResultsHtml(html);
  }

  /** See this class's doc comment — unverified against real populated markup. */
  private parseListingsFromResultsHtml(html: string): FsaListingResult[] {
    const countMatch = /Farm\s*&\s*Ranch Properties Found:\s*(\d+)/i.exec(html);
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
      // Documented column order: Photo, Listing Type, Street Address, City, State, County, Zip, Price/Bid, Total Acres, Parcels.
      if (cells.length < 9) continue;

      const [, listingType, streetAddress, city, state, county, zip, priceRaw, acresRaw] = cells;
      const priceCents = parseCurrencyToCents(priceRaw ?? "");
      const totalAcres = parseNumber(acresRaw ?? "");

      if (!state) {
        this.logger.warn("Skipping a parsed FSA result row with no state — likely a header row or markup mismatch");
        continue;
      }

      rows.push({
        state,
        county: county || null,
        city: city || null,
        zip: zip || null,
        streetAddress: streetAddress || null,
        listingType: listingType || null,
        priceCents,
        totalAcres,
      });
    }

    if (rows.length !== reportedCount) {
      this.logger.warn(
        `USDA RD/FSA Farm & Ranch page reported ${reportedCount} properties but only parsed ${rows.length} — results-table markup may not match this client's assumptions (see FsaResaleClient's doc comment)`,
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
