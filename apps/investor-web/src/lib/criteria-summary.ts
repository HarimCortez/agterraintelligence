/**
 * Human-readable one-line summary of a saved search's `criteria` (a
 * `PropertyFilters`), for the `/saved-searches` list — e.g. "Band:
 * Exceptional, Strong · Price: $0–$2,000,000 · Okeechobee County". Only
 * includes the parts of criteria that are actually set; an empty/default
 * criteria object summarizes as "All properties (no filters)" rather than
 * an empty string.
 */
import { BAND_OPTIONS, LAND_USE_OPTIONS, type PropertyFilters } from "./properties-api";
import { formatCurrencyFromCents, formatAcreage } from "./formatters";

export function summarizeCriteria(criteria: PropertyFilters): string {
  const parts: string[] = [];

  if (criteria.band && criteria.band.length > 0) {
    const labels = criteria.band.map((b) => BAND_OPTIONS.find((o) => o.value === b)?.label ?? b);
    parts.push(`Band: ${labels.join(", ")}`);
  }

  if (criteria.landUseType && criteria.landUseType.length > 0) {
    const labels = criteria.landUseType.map((l) => LAND_USE_OPTIONS.find((o) => o.value === l)?.label ?? l);
    parts.push(`Land use: ${labels.join(", ")}`);
  }

  if (criteria.minPrice !== undefined || criteria.maxPrice !== undefined) {
    const min = criteria.minPrice !== undefined ? formatCurrencyFromCents(criteria.minPrice) : "$0";
    const max = criteria.maxPrice !== undefined ? formatCurrencyFromCents(criteria.maxPrice) : "no max";
    parts.push(`Price: ${min}–${max}`);
  }

  if (criteria.minAcreage !== undefined || criteria.maxAcreage !== undefined) {
    const min = criteria.minAcreage !== undefined ? formatAcreage(criteria.minAcreage) : "0 ac";
    const max = criteria.maxAcreage !== undefined ? formatAcreage(criteria.maxAcreage) : "no max";
    parts.push(`Acreage: ${min}–${max}`);
  }

  if (criteria.minScore !== undefined || criteria.maxScore !== undefined) {
    const min = criteria.minScore ?? 0;
    const max = criteria.maxScore ?? 100;
    parts.push(`Score: ${min}–${max}`);
  }

  if (criteria.county) {
    parts.push(`${criteria.county} County`);
  }

  return parts.length > 0 ? parts.join(" · ") : "All properties (no filters)";
}
