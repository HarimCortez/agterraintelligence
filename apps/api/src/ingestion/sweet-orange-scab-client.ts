import { Injectable, Logger } from "@nestjs/common";

const SWEET_ORANGE_SCAB_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/Federal_Citrus_Quarantine_Data/FeatureServer/6/query";

/**
 * Same coded `Status` domain as `CitrusCankerClient`/`AsianCitrusPsyllidClient`'s
 * sibling layers on this service: 1 = "Active Federal Quarantine Pending",
 * 2 = "Active Federal Quarantine", 3 = "Expired Federal Quarantine".
 * Filtered server-side for the same reason documented there.
 */
const ACTIVE_STATUS_CODE = 2;

export interface SweetOrangeScabResult {
  status: "Active Federal Quarantine";
}

interface SweetOrangeScabQueryResponse {
  features?: { attributes: { Status: number } }[];
}

/**
 * Thin client for layer 6 of USDA APHIS's `Federal_Citrus_Quarantine_Data`
 * FeatureServer — the same service as `CitrusCankerClient` (layer 4) and
 * `AsianCitrusPsyllidClient` (layer 2), this time targeting Sweet Orange
 * Scab (Elsinoë australis).
 *
 * A real but comparatively minor citrus disease: cosmetic fruit
 * blemishing that affects marketability of fresh fruit, not tree health
 * or yield — a genuinely lower economic severity than Citrus Canker,
 * HLB, or the Asian Citrus Psyllid vector, which is why this client's
 * ingestion job scores its flag one tier below the other three Florida
 * citrus quarantine flags rather than matching them.
 *
 * Confirmed live: 488 real quarantine rows nationwide (Alabama, Arizona,
 * California, Florida, Louisiana, Mississippi, Texas), and all 5 of this
 * project's seed counties (DeSoto, Hardee, Highlands, Okeechobee, Polk)
 * are real, currently-active quarantine counties — the same
 * statewide-coverage outcome as `CitrusCankerClient` and
 * `AsianCitrusPsyllidClient`.
 */
@Injectable()
export class SweetOrangeScabClient {
  private readonly logger = new Logger(SweetOrangeScabClient.name);

  /** Returns null if the county has no currently-active Sweet Orange Scab quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<SweetOrangeScabResult | null> {
    const params = new URLSearchParams({
      where: `State='Florida' AND QuarantineName='${county}' AND Status=${ACTIVE_STATUS_CODE}`,
      outFields: "Status",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${SWEET_ORANGE_SCAB_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Sweet Orange Scab quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Sweet Orange Scab quarantine query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as SweetOrangeScabQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return { status: "Active Federal Quarantine" };
  }
}
