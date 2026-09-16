import { Injectable, Logger } from "@nestjs/common";
import { normalizeCountyName } from "./ers-county-economic-client";

const POVERTY_INCOME_QUERY_URL =
  "https://gisportal.ers.usda.gov/server/rest/services/Rural_Atlas_Data/Income/MapServer/3/query";

/** The end year of ERS's real "2017-21" ACS 5-year estimate window, confirmed live from the layer name. Stored as a single year rather than a range for the same reason `PropertyCountyEconomicSummary`'s existing `*Year` fields are single years. */
export const POVERTY_INCOME_YEAR = 2021;

export interface CountyPovertyIncomeResult {
  countyPovertyRatePct: number | null;
  countyChildPovertyRatePct: number | null;
  countyDeepPovertyRatePct: number | null;
  countyPerCapitaIncomeCents: number | null;
}

interface PovertyIncomeQueryResponse {
  features?: {
    attributes: {
      County: string;
      Poverty_Rate_ACS: number | null;
      Poverty_Rate_0_17_ACS: number | null;
      Deep_Pov_All: number | null;
      PerCapitaInc: number | null;
    };
  }[];
}

/**
 * Thin client for a real, live, keyless USDA ERS ArcGIS MapServer —
 * `Rural_Atlas_Data/Income`, the same `gisportal.ers.usda.gov` host as
 * `ErsCountyTypologyClient` but a different real dataset: ACS 5-year
 * (2017-21) poverty and per capita income estimates, not the 2015
 * County Typology Codes.
 *
 * A deliberate, real overlap with `ErsCountyEconomicClient`'s
 * `countyMedianHouseholdIncomeCents` rather than a duplicate: that field
 * is a single-year (2022) ACS estimate from a separate ERS bulk CSV
 * file; this client's `Median_HH_Inc_ACS` field (not tracked here, since
 * it would be redundant) is a 5-year (2017-21) estimate from a
 * completely different ERS source. Only the genuinely new metrics —
 * poverty rate, child poverty rate, deep poverty rate, and per capita
 * income — are tracked.
 *
 * Confirmed live, real and meaningful variance across this project's 5
 * seed counties, not a flat result: poverty rate ranges from 14.6%
 * (Polk) to 26.2% (Hardee); child poverty rate reaches 40.7% (Hardee) —
 * a much more granular, continuous economic-distress signal than
 * `ErsCountyTypologyClient`'s binary low-education/low-employment
 * flags.
 */
@Injectable()
export class ErsPovertyIncomeClient {
  private readonly logger = new Logger(ErsPovertyIncomeClient.name);

  /** Downloads the full Florida county poverty/income table once, returning a lookup keyed by normalized county name (same normalization as every other ERS client in this module). */
  async fetchFloridaCountyResults(): Promise<Map<string, CountyPovertyIncomeResult>> {
    const params = new URLSearchParams({
      where: "State='FL'",
      outFields: "County,Poverty_Rate_ACS,Poverty_Rate_0_17_ACS,Deep_Pov_All,PerCapitaInc",
      returnGeometry: "false",
      f: "json",
    });

    const results = new Map<string, CountyPovertyIncomeResult>();

    let response: Response;
    try {
      response = await fetch(`${POVERTY_INCOME_QUERY_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.warn(`ERS Poverty/Income request failed: ${error instanceof Error ? error.message : String(error)}`);
      return results;
    }

    if (!response.ok) {
      this.logger.warn(`ERS Poverty/Income query returned HTTP ${response.status}`);
      return results;
    }

    const body = (await response.json()) as PovertyIncomeQueryResponse;
    for (const feature of body.features ?? []) {
      const county = normalizeCountyName(feature.attributes.County);
      results.set(county, {
        countyPovertyRatePct: feature.attributes.Poverty_Rate_ACS,
        countyChildPovertyRatePct: feature.attributes.Poverty_Rate_0_17_ACS,
        countyDeepPovertyRatePct: feature.attributes.Deep_Pov_All,
        countyPerCapitaIncomeCents:
          feature.attributes.PerCapitaInc !== null ? Math.round(feature.attributes.PerCapitaInc * 100) : null,
      });
    }

    return results;
  }
}
