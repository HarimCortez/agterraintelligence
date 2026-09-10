/**
 * GET /v1/properties client — types + fetch + query-key/query-string
 * builders, per the contract documented in the task brief (verified against
 * apps/api/src/properties/*.ts, not guessed at).
 *
 * Base URL resolution:
 * - Server (Server Components / route handlers): calls the API directly at
 *   `API_URL` (defaults to http://localhost:3001). Server-to-server fetches
 *   aren't subject to browser CORS, so this bypasses the need for any CORS
 *   config on the API.
 * - Client (browser): calls the same-origin `/api/*` path, which
 *   next.config.mjs rewrites to the API. This is the piece that lets
 *   client-side filter changes work without the API needing CORS headers.
 */

export type OpportunityBand = "exceptional" | "strong" | "promising" | "watch" | "limited";

export type LandUseType =
  | "row_crop"
  | "pasture"
  | "timber"
  | "citrus"
  | "mixed_agricultural"
  | "vacant_agricultural";

export type ListingStatus = "active" | "pending" | "sold" | "off_market";

export type ValuationConfidence = "verified" | "modeled" | "ai_inferred" | "unknown";

export type SortOption = "score_desc" | "score_asc" | "price_asc" | "price_desc" | "discount_desc";

export interface PropertyFilters {
  minPrice?: number; // cents
  maxPrice?: number; // cents
  minAcreage?: number;
  maxAcreage?: number;
  minScore?: number;
  maxScore?: number;
  band?: OpportunityBand[];
  landUseType?: LandUseType[];
  listingStatus?: ListingStatus[];
  county?: string;
  sort?: SortOption;
  limit?: number;
  offset?: number;
}

export const DEFAULT_FILTERS: PropertyFilters = {
  sort: "score_desc",
  limit: 50,
  offset: 0,
};

export interface PropertyResult {
  id: string;
  address: string;
  county: string;
  state: string;
  acreage: number;
  askingPriceCents: number;
  landUseType: LandUseType;
  listingStatus: ListingStatus;
  lat: number;
  lng: number;
  opportunityScore: { score: number; band: OpportunityBand } | null;
  valuation: {
    estimatedValueCents: number;
    discountPct: number;
    confidence: ValuationConfidence;
  } | null;
  riskFlagCount: number;
}

export interface PropertiesResponse {
  results: PropertyResult[];
  total: number;
  limit: number;
  offset: number;
}

export type RiskSeverity = "low" | "medium" | "high";

export interface PropertyRiskFlag {
  id: string;
  riskType: string;
  severity: RiskSeverity;
  description: string;
  createdAt: string;
}

export interface PropertyDetail {
  id: string;
  address: string;
  county: string;
  state: string;
  acreage: number;
  askingPriceCents: number;
  pricePerAcreCents: number;
  landUseType: LandUseType;
  listingStatus: ListingStatus;
  lat: number;
  lng: number;
  opportunityScore: { score: number; band: OpportunityBand } | null;
  valuation: {
    estimatedValueCents: number;
    discountPct: number;
    confidence: ValuationConfidence;
  } | null;
  riskFlags: PropertyRiskFlag[];
}

export const BAND_OPTIONS: { value: OpportunityBand; label: string }[] = [
  { value: "exceptional", label: "Exceptional" },
  { value: "strong", label: "Strong" },
  { value: "promising", label: "Promising" },
  { value: "watch", label: "Watch" },
  { value: "limited", label: "Limited" },
];

export const LAND_USE_OPTIONS: { value: LandUseType; label: string }[] = [
  { value: "row_crop", label: "Row crop" },
  { value: "pasture", label: "Pasture" },
  { value: "timber", label: "Timber" },
  { value: "citrus", label: "Citrus" },
  { value: "mixed_agricultural", label: "Mixed agricultural" },
  { value: "vacant_agricultural", label: "Vacant agricultural" },
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score_desc", label: "Opportunity score (high to low)" },
  { value: "score_asc", label: "Opportunity score (low to high)" },
  { value: "price_asc", label: "Asking price (low to high)" },
  { value: "price_desc", label: "Asking price (high to low)" },
  { value: "discount_desc", label: "Discount vs. estimated value" },
];

/** Builds the API's repeat-key query string (`?band=strong&band=exceptional`), never comma-separated. */
export function buildQueryString(filters: PropertyFilters): string {
  const params = new URLSearchParams();

  const scalarKeys: (keyof PropertyFilters)[] = [
    "minPrice",
    "maxPrice",
    "minAcreage",
    "maxAcreage",
    "minScore",
    "maxScore",
    "county",
    "sort",
    "limit",
    "offset",
  ];
  for (const key of scalarKeys) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }

  for (const b of filters.band ?? []) params.append("band", b);
  for (const l of filters.landUseType ?? []) params.append("landUseType", l);
  for (const s of filters.listingStatus ?? []) params.append("listingStatus", s);

  return params.toString();
}

/**
 * Reverse of `buildQueryString` — parses Discover's initial filter state
 * from a Next.js Server Component page's `searchParams` prop (which is
 * already the parsed `?key=value&key=value` shape, arrays coming through
 * as `string[]` for repeated keys). Used by `app/page.tsx` so a URL like
 * `/?band=exceptional&band=strong&county=Okeechobee` renders Discover
 * pre-filtered on first load — the same mechanism "View results" on
 * `/saved-searches` relies on (it navigates to `/?<buildQueryString(...)>`)
 * and a side benefit of making Discover's URLs bookmarkable/shareable on
 * their own.
 *
 * Unknown/invalid enum values (a typo'd `band`, an out-of-range `sort`) are
 * silently dropped rather than thrown on — a malformed shared/bookmarked
 * URL should degrade to "ignore the bad part," not error the page.
 */
export function parseFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): PropertyFilters {
  const getAll = (key: string): string[] => {
    const v = searchParams[key];
    if (v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  };
  const getOne = (key: string): string | undefined => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const toNumber = (s: string | undefined): number | undefined => {
    if (s === undefined || s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  const band = getAll("band").filter((b): b is OpportunityBand =>
    BAND_OPTIONS.some((opt) => opt.value === b),
  );
  const landUseType = getAll("landUseType").filter((l): l is LandUseType =>
    LAND_USE_OPTIONS.some((opt) => opt.value === l),
  );
  const sortParam = getOne("sort");
  const sort = SORT_OPTIONS.some((opt) => opt.value === sortParam)
    ? (sortParam as SortOption)
    : DEFAULT_FILTERS.sort;
  const county = getOne("county")?.trim();

  return {
    minPrice: toNumber(getOne("minPrice")),
    maxPrice: toNumber(getOne("maxPrice")),
    minAcreage: toNumber(getOne("minAcreage")),
    maxAcreage: toNumber(getOne("maxAcreage")),
    minScore: toNumber(getOne("minScore")),
    maxScore: toNumber(getOne("maxScore")),
    band: band.length > 0 ? band : undefined,
    landUseType: landUseType.length > 0 ? landUseType : undefined,
    county: county && county !== "" ? county : undefined,
    sort,
    limit: DEFAULT_FILTERS.limit,
    offset: 0,
  };
}

function resolveBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:3001";
  }
  return "/api";
}

export async function fetchProperties(filters: PropertyFilters): Promise<PropertiesResponse> {
  const qs = buildQueryString(filters);
  const url = `${resolveBaseUrl()}/v1/properties${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load properties (HTTP ${res.status})`);
  }
  return (await res.json()) as PropertiesResponse;
}

/** Stable query key — TanStack Query's default hash sorts object keys, so key insertion order doesn't matter. */
export function propertiesQueryKey(filters: PropertyFilters): readonly [string, PropertyFilters] {
  return ["properties", filters] as const;
}

/**
 * Thrown by `fetchPropertyById` for both the API's 404 (valid UUID, no such
 * property) and 400 (`:id` isn't a valid UUID) responses — from the caller's
 * perspective both mean "there's no real Property Intelligence Page to show
 * here," so `page.tsx` maps either to Next's `notFound()` rather than
 * distinguishing them in the UI as separate error states.
 */
export class PropertyNotFoundError extends Error {}

export async function fetchPropertyById(id: string): Promise<PropertyDetail> {
  const url = `${resolveBaseUrl()}/v1/properties/${encodeURIComponent(id)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404 || res.status === 400) {
    throw new PropertyNotFoundError(`Property not found (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Failed to load property (HTTP ${res.status})`);
  }
  return (await res.json()) as PropertyDetail;
}

/** Stable query key for a single property detail fetch. */
export function propertyQueryKey(id: string): readonly [string, string] {
  return ["property", id] as const;
}
