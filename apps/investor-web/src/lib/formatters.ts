/** Formats whole-dollar USD from cents, no decimals (asking prices/valuations are whole-dollar in the seed data). */
export function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatAcreage(acreage: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(acreage);
  return `${formatted} ac`;
}

/**
 * `discountPct` is asking price's discount vs. estimated value (positive = asking
 * below estimated value, negative = asking above it). Returns the magnitude only —
 * callers should pair this with `discountDirection` for the "below"/"above" wording,
 * since the sign belongs in the word, not in a "-6.0% below" double negative.
 */
export function formatDiscountPct(pct: number): string {
  return `${Math.abs(pct).toFixed(1)}%`;
}

export function discountDirection(pct: number): "below" | "above" {
  return pct >= 0 ? "below" : "above";
}

export function formatLandUseType(value: string): string {
  return value
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** Formats a `listing_status` enum value (e.g. `off_market`) as title case, e.g. "Off Market". */
export function formatListingStatus(value: string): string {
  return formatLandUseType(value);
}

/**
 * Formats a free-string `risk_type` value (e.g. `flood_zone`, `easement`)
 * into a human-readable sentence-case label — e.g. `flood_zone` -> "Flood
 * zone". Deliberately sentence case (only the first word capitalized), not
 * title case like `formatLandUseType`, since risk types read as short
 * phrases/labels rather than proper-noun-style category names.
 */
export function formatRiskType(value: string): string {
  const words = value.split("_").filter(Boolean);
  if (words.length === 0) return value;
  const [first, ...rest] = words;
  return [`${first!.charAt(0).toUpperCase()}${first!.slice(1)}`, ...rest].join(" ");
}

/** USDA ERS's own 1-9 Rural-Urban Continuum Code scheme — see ers.usda.gov/data-products/rural-urban-continuum-codes. */
const RUCC_LABELS: Record<number, string> = {
  1: "Metro (1M+)",
  2: "Metro (250k–1M)",
  3: "Metro (<250k)",
  4: "Nonmetro, urban 20k+, metro-adjacent",
  5: "Nonmetro, urban 20k+",
  6: "Nonmetro, urban 2.5k–20k, metro-adjacent",
  7: "Nonmetro, urban 2.5k–20k",
  8: "Nonmetro, rural, metro-adjacent",
  9: "Nonmetro, rural",
};

/** Formats a USDA ERS Rural-Urban Continuum Code (1-9) as "2 · Metro (250k-1M)" — the bare number alone isn't meaningful without ERS's own category label. */
export function formatRuralUrbanContinuumCode(code: number): string {
  const label = RUCC_LABELS[code];
  return label ? `${code} · ${label}` : String(code);
}
