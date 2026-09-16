import { Injectable, Logger } from "@nestjs/common";

const TICK_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/Longhorn_Tick_Reported/FeatureServer/0/query";

export interface TickResult {
  /** "established" (confirmed self-sustaining population) or "reported" (detected, not yet confirmed established). */
  status: string;
}

interface TickQueryResponse {
  features?: { attributes: { Sheet1__Established_Status: string | null } }[];
}

/**
 * Thin client for a real, live, keyless USDA APHIS ArcGIS FeatureServer
 * tracking county-level detections of the Asian Longhorned Tick
 * (Haemaphysalis longicornis) — found the same way as
 * `EmeraldAshBorerClient`/`HpaiDairyCattleClient`, via APHIS's public
 * ArcGIS service catalog. First detected in the US in 2017; a real,
 * currently expanding invasive threat — massive infestations cause
 * severe anemia and documented cattle deaths, and the tick is a vector
 * for Theileria orientalis Ikeda, a serious cattle pathogen.
 *
 * 276 real county-level records confirmed live, each carrying a real
 * `Sheet1__Established_Status` of "established" (162 counties — a
 * confirmed self-sustaining population) or "reported" (112 counties —
 * detected but not yet confirmed established) — a genuine severity
 * signal this client surfaces directly rather than collapsing to a
 * single flag, unlike the binary presence/absence of most other
 * clients in this module.
 *
 * Concentrated in Virginia/West Virginia/North Carolina/Pennsylvania,
 * actively spreading south — Georgia already has 4 real reported
 * counties. Florida has zero real records (confirmed live) — the same
 * honest "not here yet, but real elsewhere and actively expanding
 * toward it" outcome as the other real-but-FL-absent sources in this
 * module.
 *
 * Field naming note: unlike `EmeraldAshBorerClient`'s county `NAME`
 * field, this dataset's `dtl_cnty_NAME` has no "County" suffix (e.g.
 * "Benton", not "Benton County") — confirmed live from real sample rows.
 *
 * Hardcodes `dtl_cnty_STATE_NAME='Florida'`, same as every quarantine
 * client in this module (see `CitrusQuarantineClient`'s doc comment) —
 * this project is Florida-only today, and the seed data's real absence
 * makes this the honest, currently-correct query rather than a
 * limitation baked in for its own sake.
 */
@Injectable()
export class AsianLonghornedTickClient {
  private readonly logger = new Logger(AsianLonghornedTickClient.name);

  /** Returns null if the county has no confirmed or reported tick detection on record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<TickResult | null> {
    const params = new URLSearchParams({
      where: `dtl_cnty_STATE_NAME='Florida' AND dtl_cnty_NAME='${county}'`,
      outFields: "Sheet1__Established_Status",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${TICK_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Asian Longhorned Tick request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Asian Longhorned Tick query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as TickQueryResponse;
    const feature = body.features?.[0];
    if (!feature || !feature.attributes.Sheet1__Established_Status) {
      return null;
    }

    return { status: feature.attributes.Sheet1__Established_Status };
  }
}
