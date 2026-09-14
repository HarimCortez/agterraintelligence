import { Injectable, Logger } from "@nestjs/common";

const FWS_FL_WETLANDS_QUERY_URL =
  "https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FWS_Florida_Wetlands/FeatureServer/10/query";

export interface WetlandResult {
  /** NWI classification code, e.g. "PFO1Cd", "E2AB/RFM". */
  attribute: string;
  /** Human-readable category, e.g. "Freshwater Forested/Shrub Wetland". */
  wetlandType: string;
}

interface WetlandsQueryResponse {
  features?: { attributes: { ATTRIBUTE: string; WETLAND_TYPE: string } }[];
}

/**
 * Thin client for "FWS Florida Wetlands" — a Florida-scoped extract of the
 * official USFWS National Wetlands Inventory, hosted on standard ArcGIS
 * Online infrastructure rather than the federal `wim.usgs.gov` service.
 * That federal service (`fwspublicservices.wim.usgs.gov/wetlandsmapservice`)
 * is real but broken for the exact query shape this needs: a bare
 * unfiltered query works, but any `where` clause, spatial filter, or
 * `resultRecordCount` either 400s with a generic "Failed to execute query"
 * error or times out — confirmed by testing all of those independently,
 * not assumed. This service, found as the working alternative, was
 * verified live against real seeded property coordinates before building
 * anything here: a point near Taylor Creek Cattle Ranch correctly returned
 * `PFO1Cd`/"Freshwater Forested/Shrub Wetland", and the exact
 * `where=1=1` + `resultRecordCount` combination that broke the federal
 * service returned real data cleanly on this one.
 */
@Injectable()
export class WetlandsClient {
  private readonly logger = new Logger(WetlandsClient.name);

  /** Returns null if the point doesn't intersect a mapped wetland, or if the request fails. */
  async queryPoint(lat: number, lng: number): Promise<WetlandResult | null> {
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "ATTRIBUTE,WETLAND_TYPE",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${FWS_FL_WETLANDS_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`FWS FL Wetlands request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`FWS FL Wetlands returned HTTP ${response.status} for (${lat}, ${lng})`);
      return null;
    }

    const body = (await response.json()) as WetlandsQueryResponse;
    const feature = body.features?.[0];
    if (!feature) {
      return null;
    }

    return {
      attribute: feature.attributes.ATTRIBUTE,
      wetlandType: feature.attributes.WETLAND_TYPE,
    };
  }
}
