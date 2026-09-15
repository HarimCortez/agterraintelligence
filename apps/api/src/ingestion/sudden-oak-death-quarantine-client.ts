import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const SUDDEN_OAK_DEATH_PROGRAM = "Phytophthora ramorum";

/**
 * Statuses treated as a currently-in-effect quarantine — same server-side
 * filter as `AsianLonghornedBeetleQuarantineClient`, applied defensively
 * here even though every real Phytophthora ramorum row currently has
 * status `Active Federal Quarantine` (confirmed live: no rescinded rows
 * exist for this program today, unlike ALB) — the filter costs nothing and
 * guards against the same class of bug if that ever changes.
 */
const ACTIVE_STATUSES = ["Active Federal Quarantine", "Modified Federal Quarantine"];

export interface QuarantineResult {
  /** "Active Federal Quarantine" or "Modified Federal Quarantine" — never a rescinded/pending status, filtered server-side. */
  status: string;
}

interface QuarantineQueryResponse {
  features?: { attributes: { Quarantine_Status: string } }[];
}

/**
 * Thin client for USDA APHIS's real federal plant-pest quarantine dataset —
 * the same free, no-key ArcGIS FeatureServer layer the citrus/fire
 * ant/Spongy Moth/Asian Longhorned Beetle clients use, filtered to the
 * "Phytophthora ramorum" program (Sudden Oak Death) instead. Confirmed
 * live before building anything: 17 real rows exist nationwide, all
 * currently `Active Federal Quarantine` — 16 California counties (Alameda,
 * Contra Costa, Del Norte, Humboldt, Lake, Marin, Mendocino, Monterey,
 * Napa, San Francisco, San Mateo, Santa Clara, Santa Cruz, Solano, Sonoma,
 * Trinity) and one partial Oregon county (Curry) — the real coastal
 * Pacific Northwest/Northern California range this forest pathogen is
 * actually established in.
 *
 * Florida has zero real rows for this program at any status (confirmed
 * live), the same honest "real coverage exists elsewhere, not here"
 * outcome as `SpongyMothQuarantineClient`/
 * `AsianLonghornedBeetleQuarantineClient`/`UsdaForestHealthClient`.
 *
 * `Quarantine_State='Florida'` is hardcoded below, same limitation as the
 * other four quarantine clients — see `CitrusQuarantineClient`'s doc
 * comment for what a real multi-state expansion needs.
 */
@Injectable()
export class SuddenOakDeathQuarantineClient {
  private readonly logger = new Logger(SuddenOakDeathQuarantineClient.name);

  /** Returns null if the county has no currently-active Phytophthora ramorum quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<QuarantineResult | null> {
    const statusClause = ACTIVE_STATUSES.map((s) => `'${s}'`).join(",");
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${SUDDEN_OAK_DEATH_PROGRAM}' AND Quarantine_County='${county}' AND Quarantine_Status IN (${statusClause})`,
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
      this.logger.warn(`APHIS Phytophthora ramorum quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Phytophthora ramorum quarantine query returned HTTP ${response.status} for ${county} County`);
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
