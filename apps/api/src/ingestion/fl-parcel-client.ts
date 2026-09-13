import { Injectable, Logger } from "@nestjs/common";

const SWFWMD_PARCEL_SEARCH_BASE =
  "https://www45.swfwmd.state.fl.us/arcgis12/rest/services/BaseVector/parcel_search/MapServer";

const PAGE_SIZE = 1000;

/** Florida DOR Agricultural land-use codes (50-69), zero-padded to 3 digits — matches `PARUSECODE` on this service, confirmed empirically (e.g. "061" returned with `PARUSEDESC: "GRAZING LAND SOIL CAPABILITY CLASS II"`, matching the official DOR code table exactly). */
const AGRICULTURAL_USE_CODES = Array.from({ length: 20 }, (_, i) => String(50 + i).padStart(3, "0"));

const SQFT_PER_ACRE = 43_560;

export interface FlParcelFeature {
  parcelId: string;
  dorUseCode: string;
  ownerName: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  legalDescription: string | null;
  /** Whole-dollar total parcel value ("PARVAL" — this service's equivalent of the statewide dataset's "JV" Just Value field), or null if the source has no value on file for this parcel. */
  totalValueDollars: number | null;
  /** Acres, derived from the polygon's `Shape.STArea()` (square feet, since this service's spatial reference — Florida State Plane West, wkid 2882 — uses US feet) — NOT the service's own `ACRES` field, which was found empty for every real agricultural parcel tested across multiple counties during development. Cross-checked against a real parcel's legal description ("573.50 AC") and matched within survey precision. */
  acreage: number | null;
}

interface ArcGisAttributes {
  PARCELID: string;
  PARUSECODE: string | null;
  OWNNAME: string | null;
  SITEADD: string | null;
  SCITY: string | null;
  LEGDECFULL: string | null;
  PARVAL: number | null;
  "Shape.STArea()": number | null;
}

interface ArcGisQueryResponse {
  features?: { attributes: ArcGisAttributes }[];
  error?: { code: number; message: string };
}

/**
 * Client for the Southwest Florida Water Management District's shared
 * per-county parcel MapServer — real, free, no API key, backed by each
 * county property appraiser's own real data (not a re-export). Covers 16
 * counties as separate layers on one service; this project targets the 4
 * of our 5 seed-data counties it covers (DeSoto, Hardee, Highlands, Polk —
 * see `FlParcelCadastralIngestionService`'s doc comment for why Okeechobee
 * isn't included yet).
 *
 * This service was chosen *instead of* the Florida DOR's own statewide
 * cadastral FeatureServer (`Florida_Statewide_Cadastral`, 10.8M parcels)
 * after extensive real testing proved that service's query API cannot
 * execute any selective filter (county, land-use code, or even a small
 * bounding box) without a ~55s timeout or 504 — confirmed by testing
 * county-equality, BETWEEN, spatial envelope, and deep-offset pagination,
 * all of which failed at that scale; only a fully unfiltered scan
 * responded reliably. This per-county service, scoped to one county's
 * parcels (thousands, not millions), supports real filtered + paginated
 * queries in well under a second.
 */
@Injectable()
export class FlParcelClient {
  private readonly logger = new Logger(FlParcelClient.name);

  /** Pages through every parcel in the given layer whose `PARUSECODE` falls in the agricultural range (50-69). Throws on a request/parse failure — this is a bulk sweep, not a per-property lookup, so a failure should abort the county rather than silently return an empty set. */
  async queryAgriculturalParcels(layerId: number): Promise<FlParcelFeature[]> {
    const features: FlParcelFeature[] = [];
    let offset = 0;

    for (;;) {
      const params = new URLSearchParams({
        where: `PARUSECODE IN (${AGRICULTURAL_USE_CODES.map((c) => `'${c}'`).join(",")})`,
        outFields: "PARCELID,PARUSECODE,OWNNAME,SITEADD,SCITY,LEGDECFULL,PARVAL,Shape.STArea()",
        returnGeometry: "false",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_SIZE),
        f: "json",
      });

      const response = await fetch(`${SWFWMD_PARCEL_SEARCH_BASE}/${layerId}/query?${params.toString()}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`FL parcel query returned HTTP ${response.status} for layer ${layerId} at offset ${offset}`);
      }

      const body = (await response.json()) as ArcGisQueryResponse;
      if (body.error) {
        throw new Error(`FL parcel query failed for layer ${layerId} at offset ${offset}: ${body.error.message}`);
      }

      const page = body.features ?? [];
      for (const { attributes: a } of page) {
        if (!a.PARCELID || !a.PARUSECODE) continue;

        features.push({
          parcelId: a.PARCELID,
          dorUseCode: a.PARUSECODE,
          ownerName: a.OWNNAME?.trim() || null,
          siteAddress: a.SITEADD?.trim() || null,
          siteCity: a.SCITY?.trim() || null,
          legalDescription: a.LEGDECFULL?.trim() || null,
          totalValueDollars: a.PARVAL ?? null,
          acreage: a["Shape.STArea()"] != null ? a["Shape.STArea()"] / SQFT_PER_ACRE : null,
        });
      }

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return features;
  }
}
