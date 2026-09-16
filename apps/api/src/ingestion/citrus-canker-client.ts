import { Injectable, Logger } from "@nestjs/common";

const CITRUS_CANKER_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/Federal_Citrus_Quarantine_Data/FeatureServer/4/query";

/**
 * The layer's `Status` field is a coded integer domain (`QStat`): 1 =
 * "Active Federal Quarantine Pending", 2 = "Active Federal Quarantine",
 * 3 = "Expired Federal Quarantine". Only 2 counts as currently in effect —
 * confirmed live every real Florida row is currently status 2, but this
 * client filters server-side anyway rather than assume that stays true
 * (the same lesson `AsianLonghornedBeetleQuarantineClient`'s doc comment
 * documents finding the hard way on a sibling quarantine dataset).
 */
const ACTIVE_STATUS_CODE = 2;

export interface CitrusCankerResult {
  status: "Active Federal Quarantine";
}

interface CitrusCankerQueryResponse {
  features?: { attributes: { Status: number } }[];
}

/**
 * Thin client for USDA APHIS's `Federal_Citrus_Quarantine_Data`
 * FeatureServer — a different, broader service than the one powering
 * `CitrusQuarantineClient` (HLB) and `CitrusBlackSpotClient`
 * (`PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view`), discovered
 * via APHIS's public ArcGIS service catalog. This service carries five
 * real citrus quarantine programs as separate sub-layers (Asian Citrus
 * Psyllid, Citrus Black Spot, Citrus Canker, Citrus Greening, Sweet
 * Orange Scab); this client targets layer 4, Citrus Canker.
 *
 * Citrus Canker (Xanthomonas citri) is historically one of Florida's
 * most consequential citrus diseases — the state ran a mandatory
 * eradication (tree destruction) program until 2006, when policy shifted
 * to management rather than destruction once the disease had become too
 * widespread to eradicate. Confirmed live: 93 real quarantine rows
 * nationwide (Florida 67, Texas 17, Louisiana 8, Alabama 1), and — unlike
 * most sources added to this module recently — all 5 of this project's
 * seed counties (DeSoto, Hardee, Highlands, Okeechobee, Polk) are real,
 * currently-active quarantine counties, not a real-but-absent-in-FL
 * outcome.
 *
 * The `QuarantineName` field is a plain county name with no "County"
 * suffix (e.g. "DeSoto", not "DeSoto County") — confirmed live from real
 * sample rows, matching this dataset's `State` field being the full
 * state name ("Florida", not "FL").
 *
 * Queried per county: every real Florida row in this layer is one row
 * per county (`QuarantineUnit` coded value 2 = "County"), so a
 * per-property spatial query would be a slower, more complex way to get
 * the same county-level answer — the same reasoning documented in
 * `CitrusQuarantineClient`'s doc comment for the sibling HLB program.
 */
@Injectable()
export class CitrusCankerClient {
  private readonly logger = new Logger(CitrusCankerClient.name);

  /** Returns null if the county has no currently-active Citrus Canker quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<CitrusCankerResult | null> {
    const params = new URLSearchParams({
      where: `State='Florida' AND QuarantineName='${county}' AND Status=${ACTIVE_STATUS_CODE}`,
      outFields: "Status",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${CITRUS_CANKER_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Citrus Canker quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Citrus Canker quarantine query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as CitrusCankerQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return { status: "Active Federal Quarantine" };
  }
}
