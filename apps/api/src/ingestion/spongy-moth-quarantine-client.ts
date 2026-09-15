import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const SPONGY_MOTH_PROGRAM = "Spongy Moth";

export interface QuarantineResult {
  /** e.g. "Active Federal Quarantine", "Modified Federal Quarantine". */
  status: string;
}

interface QuarantineQueryResponse {
  features?: { attributes: { Quarantine_Status: string } }[];
}

/**
 * Thin client for USDA APHIS's real federal plant-pest quarantine dataset —
 * the same free, no-key ArcGIS FeatureServer layer `CitrusQuarantineClient`/
 * `FireAntQuarantineClient` use, filtered to the "Spongy Moth" program
 * (formerly Gypsy Moth) instead. Confirmed live before building anything:
 * this is the largest single program on the whole layer — 620 real
 * county-level quarantine records, spanning the real historical Spongy
 * Moth range (Northeast and Upper Midwest, confirmed live via a real
 * sample: Wisconsin and Illinois counties, with the layer's own
 * `Quarantine_State` coded-value domain covering the full range).
 *
 * Unlike HLB/Imported Fire Ant (both `Quarantine_Statewide: "Collective"`
 * once every county in the state is covered), Spongy Moth rows are
 * genuinely county-by-county in the live data (`Quarantine_Statewide:
 * "No"` on every sampled row) — a real patchwork, not a formality that
 * happens to cover a whole state. Still queried per county, not per
 * property point, for the same reason as the other two quarantine
 * clients: the underlying data is itself county-granular, so a
 * per-property geometry query would be slower for no extra accuracy.
 *
 * `Quarantine_State='Florida'` is hardcoded below, same limitation as
 * `CitrusQuarantineClient`/`FireAntQuarantineClient` — see their doc
 * comments for what a real multi-state expansion needs. Confirmed live
 * that Florida currently has zero Spongy Moth quarantine rows (real
 * outcome, not a broken query — Florida sits outside this pest's real
 * established range) — this job's local/production runs correctly find
 * nothing to flag today, the same honest "real coverage exists elsewhere,
 * not in this project's current seed state" outcome already confirmed for
 * the USDA Forest Service Insect & Disease Survey.
 */
@Injectable()
export class SpongyMothQuarantineClient {
  private readonly logger = new Logger(SpongyMothQuarantineClient.name);

  /** Returns null if the county has no active Spongy Moth quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<QuarantineResult | null> {
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${SPONGY_MOTH_PROGRAM}' AND Quarantine_County='${county}'`,
      outFields: "Quarantine_Status",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${APHIS_QUARANTINE_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`APHIS Spongy Moth quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Spongy Moth quarantine query returned HTTP ${response.status} for ${county} County`);
      return null;
    }

    const body = (await response.json()) as QuarantineQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return { status: feature.attributes.Quarantine_Status };
  }
}
