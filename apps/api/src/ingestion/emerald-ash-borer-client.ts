import { Injectable, Logger } from "@nestjs/common";

const EAB_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9/query";

export interface EabResult {
  /** The first year APHIS confirmed Emerald Ash Borer in this county, e.g. "2016". */
  firstConfirmedYear: string;
}

interface EabQueryResponse {
  features?: { attributes: { Year_txt: string } }[];
}

/**
 * Thin client for a real, live, keyless USDA APHIS ArcGIS FeatureServer —
 * a different service than `CitrusQuarantineClient`/`FireAntQuarantineClient`/
 * `SpongyMothQuarantineClient`/`AsianLonghornedBeetleQuarantineClient`/
 * `SuddenOakDeathQuarantineClient` (all of which share one
 * `PPQ_GIS_Federal_Quarantine` layer), but discovered the same way: APHIS's
 * public ArcGIS org (`services7.arcgis.com/2C1NQ7u6M6SXoa8p`) publishes a
 * browsable service catalog at `/arcgis/rest/services?f=json`, and this
 * project's own citrus/quarantine work had only ever queried one of its 93
 * real public services.
 *
 * `PPQ_EAB_Known_Infested_Counties_Feature_Layer_View` tracks counties with
 * confirmed Emerald Ash Borer, not a live regulatory quarantine status —
 * confirmed live: the schema has no `Quarantine_Status`-style field at all,
 * just `NAME`, `STATE_NAME`, `FIPS`, and `Year_txt` (the year first
 * confirmed). This matches the real history: APHIS ended the federal EAB
 * quarantine program in January 2021 (management shifted to individual
 * states), so "known infested" is the honest framing — a permanent
 * biological fact about a county's ash population, not an active legal
 * restriction. One of the largest, most destructive forest pest datasets
 * in the country: 1,529 real infested counties nationwide, confirmed live
 * via a direct count query — EAB has killed hundreds of millions of ash
 * trees since 2002.
 *
 * A real county-naming variant found while verifying: Louisiana uses
 * "Parish" instead of "County" in the real `NAME` field (e.g. "De Soto
 * Parish", not "De Soto County") — irrelevant to this Florida-only client
 * today (Florida always uses "County"), but worth knowing before any
 * future multi-state expansion swaps the hardcoded `' County'` suffix for
 * a real state-aware mapping.
 *
 * Florida has zero real infested counties in this dataset (confirmed
 * live) — the same honest "real coverage exists elsewhere, not here"
 * outcome as the other timber-pest jobs in this module.
 */
@Injectable()
export class EmeraldAshBorerClient {
  private readonly logger = new Logger(EmeraldAshBorerClient.name);

  /** Returns null if the county has no confirmed Emerald Ash Borer infestation on record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<EabResult | null> {
    const params = new URLSearchParams({
      where: `STATE_NAME='Florida' AND NAME='${county} County'`,
      outFields: "Year_txt",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${EAB_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Emerald Ash Borer request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Emerald Ash Borer query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as EabQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return { firstConfirmedYear: feature.attributes.Year_txt };
  }
}
