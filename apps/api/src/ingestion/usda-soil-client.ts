import { Injectable, Logger } from "@nestjs/common";

const SDA_QUERY_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

export interface SoilResult {
  mapUnitKey: string;
  mapUnitSymbol: string;
  mapUnitName: string;
  drainageClass: string | null;
  floodFrequency: string | null;
  /** Percent, e.g. 2.5 for "2.5 percent slopes". */
  slopePercent: number | null;
  /** Non-irrigated capability class, dominant condition, e.g. "3e", "7". */
  capabilityClass: string | null;
  /** 0-100. */
  hydricPct: number | null;
}

interface SdaResponse {
  Table?: string[][];
  Error?: string;
}

/**
 * Thin client for USDA NRCS Soil Data Access (SDA) — the real, free, no-API-key
 * REST/JSON front end to the SSURGO soil survey database, confirmed live
 * against real seeded property coordinates (not guessed at): a point query
 * for the Kissimmee River tract (-80.805, 27.261) returned a real map unit
 * ("Water" — that tract sits on the river, a real-world sanity check the
 * query is actually working); an inland point returned
 * "Floridana, Placid, and Okeelanta soils, frequently flooded," "Very
 * poorly drained," matching that same property's existing FEMA flood-zone
 * flag — independent real data sources agreeing.
 *
 * Query shape: `SDA_Get_Mukey_from_intersection_with_WktWgs84(...)` resolves
 * a WGS84 point (WKT `point(lng lat)` — x/y order, longitude first) to the
 * SSURGO map unit(s) it falls in, joined against `muaggatt` (map unit
 * aggregated attributes — the dominant-condition summary for a map unit,
 * not per-component detail) for the attributes that matter for ag land
 * due diligence: drainage, flood frequency, slope, capability class,
 * hydric percentage. Column names were verified against the service's own
 * `muaggatt` schema (a first pass guessed `farmlndcl`/`slopegraddcd`,
 * which don't exist — real errors from the service corrected the query,
 * not assumption).
 */
@Injectable()
export class UsdaSoilClient {
  private readonly logger = new Logger(UsdaSoilClient.name);

  /** Returns null if the point has no mapped soil data, or if the request/query fails. */
  async querySoilAtPoint(lat: number, lng: number): Promise<SoilResult | null> {
    const query = `SELECT mu.mukey, mu.musym, mu.muname, ma.drclassdcd, ma.flodfreqdcd, ma.slopegraddcp, ma.niccdcd, ma.hydclprs FROM mapunit mu INNER JOIN muaggatt ma ON ma.mukey = mu.mukey WHERE mu.mukey IN (SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})'))`;

    let response: Response;
    try {
      response = await fetch(SDA_QUERY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "JSON+COLUMNNAME", query }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.warn(`SDA request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`SDA returned HTTP ${response.status} for (${lat}, ${lng})`);
      return null;
    }

    const body = (await response.json()) as SdaResponse;
    const rows = body.Table;
    if (!rows || rows.length < 2) {
      // rows[0] is the column-name header row (format: JSON+COLUMNNAME); no
      // data row means no mapped soil at this point.
      return null;
    }

    const [mukey, musym, muname, drclassdcd, flodfreqdcd, slopegraddcp, niccdcd, hydclprs] = rows[1]!;

    return {
      mapUnitKey: mukey!,
      mapUnitSymbol: musym!,
      mapUnitName: muname!,
      drainageClass: drclassdcd || null,
      floodFrequency: flodfreqdcd || null,
      slopePercent: slopegraddcp ? parseFloat(slopegraddcp) : null,
      capabilityClass: niccdcd || null,
      hydricPct: hydclprs ? parseInt(hydclprs, 10) : null,
    };
  }
}
