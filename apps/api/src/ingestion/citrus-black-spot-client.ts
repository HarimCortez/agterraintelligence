import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const CITRUS_BLACK_SPOT_PROGRAM = "Citrus Black Spot";

export interface QuarantineResult {
  /** e.g. "Active Federal Quarantine", "Modified Federal Quarantine". */
  status: string;
}

interface QuarantineQueryResponse {
  features?: { attributes: { Quarantine_Status: string } }[];
}

/**
 * Thin client for USDA APHIS's real federal plant-pest quarantine dataset —
 * the same free, no-key ArcGIS FeatureServer layer `CitrusQuarantineClient`
 * uses for Citrus Greening (HLB), filtered to the "Citrus Black Spot"
 * program instead. Unlike HLB, Citrus Black Spot is NOT county-collective —
 * confirmed live: querying by county returned hundreds of separate polygon
 * fragments per county (Hendry alone: 408), not one row with
 * `Quarantine_Statewide: "Collective"`. A county-name lookup would
 * over-flag every citrus property in a quarantined county regardless of
 * whether it's actually inside a quarantine zone, so this client queries
 * the real polygon geometry at the property's own point instead — same
 * `geometry`/`geometryType`/`spatialRel=esriSpatialRelIntersects` pattern as
 * `FemaFloodZoneClient`.
 *
 * Verified before building the ingestion job: a point query at a known
 * quarantine polygon's own centroid correctly returned a hit (two, in
 * fact — Modified and Active status both present at that point), and
 * separately, all three of this project's seeded citrus properties
 * (Arcadia/DeSoto, Sun 'n Lake/Highlands, Frostproof/Polk) returned no
 * hit — a real result, not a broken query: those seed points happen to
 * sit outside the actual quarantine polygons in their counties, the same
 * "seed point isn't guaranteed to land on the relevant feature" caveat
 * already documented for FEMA/soil/CDL point queries.
 */
@Injectable()
export class CitrusBlackSpotClient {
  private readonly logger = new Logger(CitrusBlackSpotClient.name);

  /** Returns null if the point falls outside every real Citrus Black Spot quarantine polygon, or if the request fails. */
  async queryPoint(lat: number, lng: number): Promise<QuarantineResult | null> {
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${CITRUS_BLACK_SPOT_PROGRAM}'`,
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
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
      this.logger.warn(`APHIS Citrus Black Spot request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS Citrus Black Spot query returned HTTP ${response.status} for (${lat}, ${lng})`);
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
