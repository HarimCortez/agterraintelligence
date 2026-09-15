import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const CITRUS_GREENING_PROGRAM = "Citrus Greening (HLB)";

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
 * Thin client for USDA APHIS's real federal plant-pest quarantine
 * dataset — free, no API key. Confirmed live before building anything:
 * the county field needs the full state name ("Florida", not "FL" — the
 * layer has both `Quarantine_State` and `Quarantine_State_Abbr` fields,
 * and only the former actually matches rows), and a real query for our 5
 * target counties returned "Active Federal Quarantine" for Citrus
 * Greening (HLB) in all 5 (DeSoto, Hardee, Highlands, Okeechobee, Polk) —
 * matching Florida's real, ongoing statewide HLB crisis, not a guess.
 *
 * Queried per county, not per property point: the underlying data is
 * itself county-granular for this program (every hit returned
 * `Quarantine_Statewide: "Collective"` — a county-by-county quarantine
 * that happens to now cover the whole state — rather than sub-county
 * polygons), so a per-property geometry query would just be a slower,
 * more complex way to get the same county-level answer.
 *
 * Filters `Quarantine_Status IN ('Active Federal Quarantine', 'Modified
 * Federal Quarantine')` server-side (fix mirrored from
 * `AsianLonghornedBeetleQuarantineClient`, which is where this bug was
 * originally found and fixed) — the same live FeatureServer contains real
 * `Rescinded Federal Quarantine` rows for other programs/counties, and this
 * client previously treated any returned row as "currently quarantined"
 * regardless of status. It never surfaced as a bug for Florida's HLB
 * counties specifically because each of the 5 target counties happened to
 * have at most one live record with an active-style status, not because
 * the unfiltered query was actually safe.
 */
@Injectable()
export class CitrusQuarantineClient {
  private readonly logger = new Logger(CitrusQuarantineClient.name);

  /** Returns null if the county has no currently-active Citrus Greening (HLB) quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<QuarantineResult | null> {
    const statusClause = ACTIVE_STATUSES.map((s) => `'${s}'`).join(",");
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${CITRUS_GREENING_PROGRAM}' AND Quarantine_County='${county}' AND Quarantine_Status IN (${statusClause})`,
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
      this.logger.warn(`APHIS quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS quarantine query returned HTTP ${response.status} for ${county} County`);
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
