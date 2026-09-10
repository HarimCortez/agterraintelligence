/**
 * Small shared Mapbox helpers used by both the Discover multi-property map
 * (`components/discover/PropertyMap.tsx`) and the Property Intelligence
 * Page's single-property map (`components/property-detail/PropertyDetailMap.tsx`)
 * — extracted so the detail-page map reuses the Discover map's token/style
 * setup and score-band color logic instead of redefining them, per the task
 * brief's "don't rebuild Mapbox setup from scratch" instruction.
 */
import type { OpportunityBand } from "./properties-api";

/** Satellite-streets basemap style used everywhere in this product's map views. */
export const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

/**
 * Resolves and validates the Mapbox access token from env, logging (not
 * throwing) if it's missing so a map-less page still renders instead of
 * crashing. Callers should bail out of their init effect when this returns
 * null.
 */
export function getMapboxToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not set — map cannot render.");
    return null;
  }
  return token;
}

/**
 * Flat score-band marker fill colors — DESIGN-SYSTEM.md's "Map Marker —
 * Opportunity Score Color Expression" table, as a plain function rather than
 * a Mapbox GL `step` expression, for contexts (like a single DOM
 * `mapboxgl.Marker`) that need a resolved CSS color string rather than a
 * data-driven paint expression.
 */
export function scoreBandMarkerColor(band: OpportunityBand | null): string {
  switch (band) {
    case "exceptional":
      return "#14532D";
    case "strong":
      return "#1E7A42";
    case "promising":
      return "#3FA65C";
    case "watch":
      return "#64748B";
    case "limited":
      return "#CBD5E1";
    default:
      return "#FFFFFF";
  }
}
