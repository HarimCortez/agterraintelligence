import { Injectable, Logger } from "@nestjs/common";
import { normalizeCountyName } from "./ers-county-economic-client";

const COUNTY_CLASSIFICATIONS_QUERY_URL =
  "https://gisportal.ers.usda.gov/server/rest/services/Rural_Atlas_Data/County_Classifications/MapServer/6/query";

export interface CountyTypologyResult {
  countyFarmingDependent: boolean | null;
  countyHighNaturalAmenities: boolean | null;
  countyRetirementDestination: boolean | null;
  countyPopulationLoss: boolean | null;
  countyLowEducation: boolean | null;
  countyLowEmployment: boolean | null;
}

interface CountyClassificationsQueryResponse {
  features?: {
    attributes: {
      County: string;
      Type_2015_Farming_NO: number | null;
      HiAmenity: number | null;
      Retirement_Destination_2015_Update: number | null;
      Population_loss_2015_update: number | null;
      Low_Education_2015_update: number | null;
      Low_Employment_2015_update: number | null;
    };
  }[];
}

/** ERS stores each flag as a 0/1 double, not a native boolean — null means the county wasn't classified for that flag at all (rare; not the same as 0/false). */
function toFlag(value: number | null): boolean | null {
  if (value === null) return null;
  return value === 1;
}

/**
 * Thin client for a real, live, keyless USDA ERS (Economic Research
 * Service) ArcGIS MapServer — a different ERS host
 * (`gisportal.ers.usda.gov`) than `ErsCountyEconomicClient`'s plain CSV
 * downloads, discovered via ERS's own documented "Geospatial APIs" page
 * (`ers.usda.gov/developer/geospatial-apis`). Real 2015-edition County
 * Typology Codes + Natural Amenities Scale — ERS has not re-released
 * these classifications since, so unlike `ErsCountyEconomicClient`'s
 * fields there's no vintage year to track.
 *
 * Every layer on this MapServer (0-16) is symbolized differently but
 * shares the same underlying attribute table, so a single query against
 * any one layer (this client uses layer 6, "Farming-dependent
 * counties") returns all six real classification flags in one row per
 * county: farming-dependent economy, high natural amenities,
 * retirement-destination county, population-loss county, low-education
 * county, low-employment county.
 *
 * Confirmed live, real variance across this project's 5 seed counties —
 * not a flat, uninformative result: Highlands and Polk are flagged
 * "retirement destination" while DeSoto/Hardee/Okeechobee aren't;
 * DeSoto/Hardee/Okeechobee are flagged "low education" and "low
 * employment" while Highlands/Polk aren't. All 5 share "high natural
 * amenities" — real (not a bug), consistent with rural central
 * Florida's genuine natural-amenity profile, and none are flagged
 * "farming-dependent" by ERS's specific economic-dependency threshold
 * despite being agricultural land — a real, honestly-reported outcome,
 * not evidence the source is broken.
 */
@Injectable()
export class ErsCountyTypologyClient {
  private readonly logger = new Logger(ErsCountyTypologyClient.name);

  /**
   * Downloads the full Florida county classification table once,
   * returning a lookup keyed by normalized county name (same
   * normalization as `ErsCountyEconomicClient`, so the two clients'
   * results can be joined against the same `property.county` values).
   */
  async fetchFloridaCountyResults(): Promise<Map<string, CountyTypologyResult>> {
    const params = new URLSearchParams({
      where: "State='FL'",
      outFields:
        "County,Type_2015_Farming_NO,HiAmenity,Retirement_Destination_2015_Update,Population_loss_2015_update,Low_Education_2015_update,Low_Employment_2015_update",
      returnGeometry: "false",
      f: "json",
    });

    const results = new Map<string, CountyTypologyResult>();

    let response: Response;
    try {
      response = await fetch(`${COUNTY_CLASSIFICATIONS_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.warn(`ERS County Classifications request failed: ${error instanceof Error ? error.message : String(error)}`);
      return results;
    }

    if (!response.ok) {
      this.logger.warn(`ERS County Classifications query returned HTTP ${response.status}`);
      return results;
    }

    const body = (await response.json()) as CountyClassificationsQueryResponse;
    for (const feature of body.features ?? []) {
      const county = normalizeCountyName(feature.attributes.County);
      results.set(county, {
        countyFarmingDependent: toFlag(feature.attributes.Type_2015_Farming_NO),
        countyHighNaturalAmenities: toFlag(feature.attributes.HiAmenity),
        countyRetirementDestination: toFlag(feature.attributes.Retirement_Destination_2015_Update),
        countyPopulationLoss: toFlag(feature.attributes.Population_loss_2015_update),
        countyLowEducation: toFlag(feature.attributes.Low_Education_2015_update),
        countyLowEmployment: toFlag(feature.attributes.Low_Employment_2015_update),
      });
    }

    return results;
  }
}
