import { Injectable, Logger } from "@nestjs/common";

const APHIS_QUARANTINE_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query";

const FIRE_ANT_PROGRAM = "Imported Fire Ant";

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
 * uses, filtered to the "Imported Fire Ant" program instead. Confirmed live
 * before building anything: querying the layer's own `Quarantine_Program`
 * coded-value domain returns 21 real distinct federal quarantine programs
 * (citrus pests, several fruit flies, Spongy Moth, Spotted Lanternfly,
 * Asian Longhorned Beetle, Phytophthora ramorum, Imported Fire Ant, and
 * more) — this dataset is far broader than the citrus-only slice this
 * project used it for so far, and unlike citrus pests, Imported Fire Ant is
 * relevant to every agricultural land use, not just citrus groves.
 *
 * A real query for Polk County confirmed the same shape as HLB: `Active
 * Federal Quarantine`, `Quarantine_Statewide: "Collective"`,
 * `Quarantine_Unit: "County"` — a genuinely county-granular quarantine, so
 * this client queries per county like `CitrusQuarantineClient`, not per
 * property point. The real quarantine area is large — the layer's own
 * `Quarantine_State` coded-value domain lists 14+ states (Texas, Georgia,
 * Florida, Mississippi, Louisiana, Virginia, and more), matching the real,
 * long-standing Southeastern/South-Central US fire ant range, not a
 * FL-specific guess.
 *
 * `Quarantine_State='Florida'` is hardcoded below, same as
 * `CitrusQuarantineClient` — every property in this project is
 * Florida-only today. When the product expands to other states, this
 * needs a real `properties.state` (abbreviation, e.g. "GA") to
 * `Quarantine_State` (full name, e.g. "Georgia") mapping — the layer's own
 * `Quarantine_State_Abbr` field exists but historically doesn't reliably
 * match rows (see `CitrusQuarantineClient`'s doc comment), so the mapping
 * needs to go through the full-name field, not swap to the abbreviation
 * field as a shortcut.
 */
@Injectable()
export class FireAntQuarantineClient {
  private readonly logger = new Logger(FireAntQuarantineClient.name);

  /** Returns null if the county has no active Imported Fire Ant quarantine record, or if the request fails. */
  async queryCountyStatus(county: string): Promise<QuarantineResult | null> {
    const params = new URLSearchParams({
      where: `Quarantine_State='Florida' AND Quarantine_Program='${FIRE_ANT_PROGRAM}' AND Quarantine_County='${county}'`,
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
      this.logger.warn(`APHIS fire ant quarantine request failed for ${county} County: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(`APHIS fire ant quarantine query returned HTTP ${response.status} for ${county} County`);
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
