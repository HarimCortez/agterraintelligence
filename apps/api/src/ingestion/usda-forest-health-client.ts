import { Injectable, Logger } from "@nestjs/common";

const IDS_QUERY_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InsectandDiseaseSurvey_01/MapServer/0/query";

/** Search radius, in miles, around a property's coordinates. Real forest pest/disease outbreaks (bark beetle, defoliation events) routinely span many square miles, and the underlying data is aerial-detected points, not a per-parcel survey — a radius search is the only geometrically honest way to use this dataset, not an exact point-in-point match. */
const SEARCH_RADIUS_MILES = 10;
/** Rough degrees-per-mile conversion for a bounding envelope — doesn't need to be precise (the query result is inherently a "nearby," not exact, signal). */
const DEGREES_PER_MILE = 1 / 69;
const MAX_RESULTS = 5;

export interface ForestHealthDetection {
  /** Common name of the causal pest/disease/abiotic agent, e.g. "cypress looper", "Southern Pine Beetle". */
  causalAgent: string;
  /** e.g. "Defoliation > 75% of leaves defoliated", "Mortality". */
  damageType: string;
  /** Affected tree species, e.g. "Loblolly Pine" — sometimes "known but not listed" in the real data. */
  host: string;
  /** Year of the aerial detection survey. */
  surveyYear: number;
}

interface IdsQueryResponse {
  features?: { attributes: Record<string, string | number | null> }[];
}

/**
 * Thin client for the real USDA Forest Service Insect & Disease Survey (IDS)
 * — a free, no-key ArcGIS REST FeatureServer of aerial-detected forest pest/
 * disease/abiotic damage points, confirmed live via its own `?f=json`
 * service description (point geometry; fields include `dca_common_name`,
 * `damage_type`, `host`, `survey_year` — no county/state field, location is
 * coordinates only).
 *
 * Deliberately a radius/envelope query, not the exact point-intersects
 * pattern `FemaFloodZoneClient`/`UsdaRdEligibilityClient` use: this dataset
 * is itself a set of discrete aerial-detection points (not a continuous
 * polygon layer), so "does this exact coordinate intersect a point" would
 * almost always miss even for a property genuinely inside an active
 * outbreak. `SEARCH_RADIUS_MILES` (10) matches the real spatial scale of
 * forest pest outbreaks (bark beetle/defoliation events routinely span many
 * square miles) — confirmed live: a 25-mile envelope around this project's
 * two seeded timber properties (Lake Placid/Highlands, Hardee/Hardee) found
 * zero real detections, while the same query around a non-timber seeded
 * property (Buckhead Ridge/Okeechobee) found a real one ("cypress looper,"
 * Defoliation > 75%, survey_year 2024) — genuine, sparse-but-real Florida
 * coverage, not a broken query.
 *
 * Initially deprioritized entirely after that same live check (real data,
 * but essentially no signal near this project's 20 Florida seed
 * properties) — corrected after the product owner pointed out the project
 * is nationwide and Florida's current small seed set isn't a valid reason
 * to skip a real, live, keyless dataset that has real coverage nationwide
 * (especially Pacific Northwest, Rockies, and Southern pine-belt outbreak
 * zones).
 */
@Injectable()
export class UsdaForestHealthClient {
  private readonly logger = new Logger(UsdaForestHealthClient.name);

  /** Returns up to 5 of the most recent real detections within `SEARCH_RADIUS_MILES` of the point, newest first — empty if none found, or if the request fails. */
  async queryNearby(lat: number, lng: number): Promise<ForestHealthDetection[]> {
    const degRadius = SEARCH_RADIUS_MILES * DEGREES_PER_MILE;
    const params = new URLSearchParams({
      geometry: JSON.stringify({
        xmin: lng - degRadius,
        ymin: lat - degRadius,
        xmax: lng + degRadius,
        ymax: lat + degRadius,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "dca_common_name,damage_type,host,survey_year",
      returnGeometry: "false",
      orderByFields: "survey_year DESC",
      resultRecordCount: String(MAX_RESULTS),
      f: "json",
    });

    let response: Response;
    try {
      response = await fetch(`${IDS_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`USDA Forest Health IDS request failed for (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }

    if (!response.ok) {
      this.logger.warn(`USDA Forest Health IDS query returned HTTP ${response.status} for (${lat}, ${lng})`);
      return [];
    }

    const body = (await response.json()) as IdsQueryResponse;
    return (body.features ?? [])
      .map((feature) => {
        const { dca_common_name, damage_type, host, survey_year } = feature.attributes;
        if (typeof dca_common_name !== "string" || typeof damage_type !== "string" || typeof survey_year !== "number") {
          return null;
        }
        return {
          causalAgent: dca_common_name,
          damageType: damage_type,
          host: typeof host === "string" ? host : "unknown",
          surveyYear: survey_year,
        } satisfies ForestHealthDetection;
      })
      .filter((detection): detection is ForestHealthDetection => detection !== null);
  }
}
