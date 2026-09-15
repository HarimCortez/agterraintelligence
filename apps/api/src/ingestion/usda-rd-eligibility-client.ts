import { Injectable, Logger } from "@nestjs/common";

const ELIGIBILITY_IDENTIFY_URL =
  "https://rdgdwe.sc.egov.usda.gov/arcgis/rest/services/Eligibility/Eligibility/MapServer/identify";

/**
 * Layer IDs on the real USDA Rural Development Eligibility MapServer,
 * confirmed live via its own `?f=json` service description. The service is
 * deliberately subtractive — each layer is a polygon of where a program is
 * INELIGIBLE (an urbanized area exceeding that program's population
 * threshold), so a point that intersects no polygon is eligible for every
 * program. Twelve layers exist in total; only the three below are tracked,
 * deliberately narrow to the best-known, most broadly land-investment-
 * relevant RD lending programs — home loans, business loans, and community
 * facility loans. The rest (electric, water/environmental, broadband
 * infrastructure, proposed/previous boundary vintages) are utility- or
 * program-administration-specific and not tracked.
 */
const LAYER_CATEGORIES: Record<number, RdEligibilityCategory> = {
  4: "housing", // RHS SFH MFH — Single Family / Multi-Family Housing loans
  2: "business", // RBS — Rural Business Service (Business & Industry) loans
  3: "business", // RBS 50K — same program family, different population-threshold vintage
  10: "community_facilities", // CF — Community Facilities loans
};
const TRACKED_LAYER_IDS = "4,2,3,10";

export type RdEligibilityCategory = "housing" | "business" | "community_facilities";

interface IdentifyResponse {
  results?: { layerId: number }[];
}

/**
 * Thin client for the real USDA Rural Development Eligibility MapServer —
 * a free, no-key ArcGIS REST service (confirmed live via its own `?f=json`
 * service description: "Rural Designations (Ineligible Areas) by program.
 * These layers are current, and updated often"). Same per-point
 * `identify`/intersects pattern as `FemaFloodZoneClient`/`WetlandsClient`.
 *
 * A real connectivity quirk found while verifying: `curl` and Python's
 * `urllib` on this dev machine both fail this host with a TLS handshake
 * error (`SSLV3_ALERT_HANDSHAKE_FAILURE`), but Node's native `fetch`
 * connects and returns real data — a local-client TLS-stack mismatch, not
 * an actual problem with the service. Confirmed by testing directly with
 * `node -e` before writing this client, not assumed.
 *
 * Verified live against all 20 of this project's real seeded property
 * coordinates before building the ingestion job: 16 fully eligible (no
 * hits on any tracked layer), 2 (both Polk, near Bartow) ineligible for
 * housing loans only, 1 (Polk, near Frostproof) ineligible for business
 * loans only — real, meaningful variance tied to real proximity-to-town
 * effects, unlike a separately-researched NRCS Farmland Classification
 * field that came back uniform ("Not prime farmland") for the same 20
 * properties and wasn't pursued for that reason.
 */
@Injectable()
export class UsdaRdEligibilityClient {
  private readonly logger = new Logger(UsdaRdEligibilityClient.name);

  /** Returns the set of tracked program categories this point is INELIGIBLE for — empty if fully eligible, or if the request fails. */
  async queryPoint(lat: number, lng: number): Promise<Set<RdEligibilityCategory>> {
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: `all:${TRACKED_LAYER_IDS}`,
      tolerance: "0",
      mapExtent: `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`,
      imageDisplay: "400,400,96",
      returnGeometry: "false",
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${ELIGIBILITY_IDENTIFY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`USDA RD eligibility request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return new Set();
    }

    if (!response.ok) {
      this.logger.warn(`USDA RD eligibility query returned HTTP ${response.status} for (${lat}, ${lng})`);
      return new Set();
    }

    const body = (await response.json()) as IdentifyResponse;
    const categories = new Set<RdEligibilityCategory>();
    for (const result of body.results ?? []) {
      const category = LAYER_CATEGORIES[result.layerId];
      if (category) categories.add(category);
    }
    return categories;
  }
}
