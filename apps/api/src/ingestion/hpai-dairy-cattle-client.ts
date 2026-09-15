import { Injectable, Logger } from "@nestjs/common";

const HPAI_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/VS_HPAI_Livestock_Events_Feature_Layer/FeatureServer/11/query";

export interface HpaiStateResult {
  /** Sum of `Total` across every real monthly confirmation row for the state — a cumulative event count, not a currently-active case count (HPAI detections don't have a "resolved" status in this dataset). */
  totalConfirmedEvents: number;
}

interface HpaiQueryResponse {
  features?: { attributes: { Total: number } }[];
}

/**
 * Thin client for a real, live, keyless USDA APHIS Veterinary Services
 * ArcGIS FeatureServer tracking confirmed Highly Pathogenic Avian
 * Influenza (H5N1) detections in dairy cattle — found the same way as
 * `EmeraldAshBorerClient`, via APHIS's public ArcGIS service catalog
 * (`services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services?f=json`).
 * Genuinely current: the real 2024-2026 H5N1-in-dairy-cattle outbreak,
 * confirmed live across 19+ real states (Arizona, California, Colorado,
 * Idaho, Iowa, Kansas, Michigan, Minnesota, Nebraska, Nevada, New Mexico,
 * North Carolina, Ohio, Oklahoma, South Dakota, Texas, Utah, Wisconsin,
 * Wyoming), 64 real monthly confirmation rows total as of verification.
 *
 * Deliberately state-level, not county-level, unlike every other spatial
 * client in this module — confirmed live: the layer has exactly one real
 * sub-layer (`HPAI_Cattle_ConfDateMMYY_GIS_States`), geometry is state
 * polygons, and the schema (`STATE_ABBR`, `STATE_FIPS`, `STATE_NAME`,
 * `Conf_MMYY`, `Total`) has no county field at all — APHIS only publishes
 * this dataset at state granularity, not a limitation this project is
 * working around. One real convenience this brings: `STATE_ABBR` is
 * already a 2-letter code matching `properties.state` directly, unlike
 * the quarantine layer's `Quarantine_State` full-name field (see
 * `CitrusQuarantineClient`'s doc comment) — no state-abbreviation-to-
 * full-name mapping needed here.
 *
 * Florida has zero real rows in this dataset (confirmed live) — the same
 * honest "real coverage exists elsewhere, not here" outcome as the
 * timber-pest jobs in this module, this time for a livestock disease
 * rather than a forest pest.
 */
@Injectable()
export class HpaiDairyCattleClient {
  private readonly logger = new Logger(HpaiDairyCattleClient.name);

  /** Returns the state's cumulative confirmed HPAI-in-dairy-cattle event count, or null if the state has no real rows on record, or if the request fails. */
  async queryStateStatus(stateAbbr: string): Promise<HpaiStateResult | null> {
    const params = new URLSearchParams({
      where: `STATE_ABBR='${stateAbbr}'`,
      outFields: "Total",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${HPAI_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`USDA APHIS HPAI dairy cattle request failed for state ${stateAbbr}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`USDA APHIS HPAI dairy cattle query returned HTTP ${response.status} for state ${stateAbbr}`);
      return null;
    }

    const body = (await response.json()) as HpaiQueryResponse;
    const rows = body.features ?? [];
    if (rows.length === 0) {
      return null;
    }

    const totalConfirmedEvents = rows.reduce((sum, row) => sum + (row.attributes.Total ?? 0), 0);
    return { totalConfirmedEvents };
  }
}
