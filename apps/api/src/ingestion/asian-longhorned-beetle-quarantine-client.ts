import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const ASIAN_LONGHORNED_BEETLE_PROGRAM = "Asian Longhorned Beetle";

/**
 * Statuses treated as a currently-in-effect quarantine. Deliberately
 * excludes `Rescinded Federal Quarantine` (eradication succeeded, no
 * longer in effect) and `Pending Federal Quarantine` (not yet in effect) —
 * see this client's doc comment for the real bug this avoids.
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
 * ant/Spongy Moth clients use, filtered to the "Asian Longhorned Beetle"
 * program instead. Confirmed live before building anything: 40 real rows
 * exist for this program nationwide.
 *
 * A real, previously-latent bug found and fixed here, not present in the
 * other three quarantine clients only because it never happened to surface
 * for their specific counties: this program's own real status breakdown is
 * 7 `Active Federal Quarantine`, 7 `Modified Federal Quarantine`, and 26
 * `Rescinded Federal Quarantine` (eradication succeeded — the quarantine
 * area shrinks over time as APHIS clears infested zones, e.g. real
 * rescinded rows exist for Massachusetts/Norfolk, New Jersey/Hudson, and
 * NYC boroughs that were quarantined years ago and have since been
 * cleared). None of `CitrusQuarantineClient`/`FireAntQuarantineClient`/
 * `SpongyMothQuarantineClient` filter by `Quarantine_Status` in their query
 * — they treat any returned row as "currently quarantined," which was safe
 * for those three only because every county checked so far happened to
 * have at most one live record with an active-style status, never a stale
 * rescinded one sitting alongside or instead of it. This client filters
 * `Quarantine_Status IN ('Active Federal Quarantine', 'Modified Federal
 * Quarantine')` server-side so a real rescinded record can never be
 * surfaced as if it were still in effect. (The other three clients carry
 * this same latent risk for any future county/program combination where a
 * quarantine has actually been lifted — worth a follow-up fix, out of
 * scope for this job.)
 *
 * Real currently-active coverage, confirmed live: Ohio/Clermont,
 * Massachusetts/Worcester, New York/Nassau & Suffolk, South
 * Carolina/Charleston & Dorchester — a small, genuinely active set, unlike
 * Spongy Moth's much larger footprint. Florida has zero real rows for this
 * program at any status (confirmed live) — the same honest "real coverage
 * exists elsewhere, not here" outcome as
 * `SpongyMothQuarantineClient`/`UsdaForestHealthClient`.
 *
 * `Quarantine_State='Florida'` is hardcoded below, same limitation as the
 * other three quarantine clients — see `CitrusQuarantineClient`'s doc
 * comment for what a real multi-state expansion needs.
 */
@Injectable()
export class AsianLonghornedBeetleQuarantineClient {
  private readonly logger = new Logger(AsianLonghornedBeetleQuarantineClient.name);

  /** Returns null if the county has no currently-active Asian Longhorned Beetle quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<QuarantineResult | null> {
    const statusClause = ACTIVE_STATUSES.map((s) => `'${s}'`).join(",");
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${ASIAN_LONGHORNED_BEETLE_PROGRAM}' AND Quarantine_County='${county}' AND Quarantine_Status IN (${statusClause})`,
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
      this.logger.warn(`APHIS Asian Longhorned Beetle quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Asian Longhorned Beetle quarantine query returned HTTP ${response.status} for ${county} County`);
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
