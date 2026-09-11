import { Injectable, Logger } from "@nestjs/common";

const NFHL_FLOOD_ZONES_QUERY_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

export interface FloodZoneResult {
  /** e.g. "AE", "X", "A" — FEMA's flood zone code. */
  zone: string;
  zoneSubType: string | null;
  /** True when the point falls in a Special Flood Hazard Area (the 1%-annual-chance flood zone FEMA actually requires flood insurance for). */
  isSpecialFloodHazardArea: boolean;
}

interface NfhlQueryResponse {
  features?: { attributes: { FLD_ZONE: string; ZONE_SUBTY: string | null; SFHA_TF: "T" | "F" } }[];
}

/**
 * Thin client for FEMA's public National Flood Hazard Layer (NFHL) ArcGIS
 * REST service — free, no API key, real data. Verified directly against
 * the live service (not guessed at): a point query for a real seeded
 * property (Lake Okeechobee Vacant Ag Parcel, -80.78/27.22) returns
 * `FLD_ZONE: "AE"`, `SFHA_TF: "T"`, matching that property's existing
 * fabricated seed risk flag — real-world confirmation the seed data
 * wasn't arbitrary. Endpoint path confirmed via web search after the
 * commonly-referenced `/gis/nfhl/rest/...` path turned out to be stale
 * (404s against a WebSEAL gateway); the correct current path is
 * `/arcgis/rest/services/public/NFHL/MapServer/28/query`.
 */
@Injectable()
export class FemaFloodZoneClient {
  private readonly logger = new Logger(FemaFloodZoneClient.name);

  /** Returns null if the point has no flood zone feature at all (extremely rare for US land, but the service can be sparse at the coast/edges), or if the request fails. */
  async queryPoint(lat: number, lng: number): Promise<FloodZoneResult | null> {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${NFHL_FLOOD_ZONES_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`FEMA NFHL request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`FEMA NFHL returned HTTP ${response.status} for (${lat}, ${lng})`);
      return null;
    }

    const body = (await response.json()) as NfhlQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return {
      zone: feature.attributes.FLD_ZONE,
      zoneSubType: feature.attributes.ZONE_SUBTY,
      isSpecialFloodHazardArea: feature.attributes.SFHA_TF === "T",
    };
  }
}
