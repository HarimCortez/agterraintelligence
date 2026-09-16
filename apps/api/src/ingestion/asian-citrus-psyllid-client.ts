import { Injectable, Logger } from "@nestjs/common";

const ASIAN_CITRUS_PSYLLID_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/Federal_Citrus_Quarantine_Data/FeatureServer/2/query";

/**
 * Same coded `Status` domain as `CitrusCankerClient`'s sibling layer on
 * this service: 1 = "Active Federal Quarantine Pending", 2 = "Active
 * Federal Quarantine", 3 = "Expired Federal Quarantine". Filtered
 * server-side for the same reason documented there.
 */
const ACTIVE_STATUS_CODE = 2;

export interface AsianCitrusPsyllidResult {
  status: "Active Federal Quarantine";
}

interface AsianCitrusPsyllidQueryResponse {
  features?: { attributes: { Status: number } }[];
}

/**
 * Thin client for layer 2 of USDA APHIS's `Federal_Citrus_Quarantine_Data`
 * FeatureServer — the same service as `CitrusCankerClient` (layer 4),
 * this time targeting the Asian Citrus Psyllid (Diaphorina citri)
 * quarantine.
 *
 * The psyllid is the insect vector that transmits Citrus Greening (HLB)
 * — already covered by `CitrusQuarantineClient` — but its own federal
 * quarantine is a real, distinct regulatory concern: psyllid quarantine
 * drives mandatory grower spray and monitoring programs independent of
 * whether a given grove has actually tested HLB-positive, since the
 * insect itself (not just the disease) is the regulated article.
 *
 * Confirmed live: 828 real quarantine rows nationwide (the largest real
 * program on this service, spanning Alabama, American Samoa, Arizona,
 * California, Florida, Georgia, Guam, Hawaii, Louisiana, Mississippi,
 * Nevada, Puerto Rico, South Carolina, Texas), and all 5 of this
 * project's seed counties (DeSoto, Hardee, Highlands, Okeechobee, Polk)
 * are real, currently-active quarantine counties — the same
 * statewide-coverage outcome as `CitrusCankerClient`.
 */
@Injectable()
export class AsianCitrusPsyllidClient {
  private readonly logger = new Logger(AsianCitrusPsyllidClient.name);

  /** Returns null if the county has no currently-active Asian Citrus Psyllid quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<AsianCitrusPsyllidResult | null> {
    const params = new URLSearchParams({
      where: `State='Florida' AND QuarantineName='${county}' AND Status=${ACTIVE_STATUS_CODE}`,
      outFields: "Status",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${ASIAN_CITRUS_PSYLLID_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Asian Citrus Psyllid quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Asian Citrus Psyllid quarantine query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as AsianCitrusPsyllidQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return { status: "Active Federal Quarantine" };
  }
}
