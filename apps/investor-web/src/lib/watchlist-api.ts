/**
 * Watchlist API client — `GET /v1/watchlist`, `POST /v1/watchlist/:propertyId`,
 * `DELETE /v1/watchlist/:propertyId`. All three require a real access token
 * (`JwtAuthGuard` on the API side), so every call here goes through
 * `authFetch` rather than plain `fetch`. Verified against
 * `apps/api/src/watchlist/dto/watchlist.dto.ts` and
 * `watchlist.controller.ts`, not guessed at:
 *   - GET returns `{ items: WatchlistItemDto[], count: number }`, where each
 *     item's `property` is the *full detail* shape (`PropertyDetailDto` —
 *     same shape as `PropertyDetail` in `properties-api.ts`, riskFlags array
 *     included, not a `riskFlagCount` summary).
 *   - POST/DELETE are idempotent (200 / 204 respectively even if already
 *     in/not-in the requested state).
 *
 * Client-only (all callers are logged-in-only UI: `WatchToggle`,
 * `WatchlistWorkspace`), so unlike `properties-api.ts` there's no
 * server-vs-client base URL split to handle — always the same-origin
 * `/api/*` rewrite.
 */
"use client";

import { authFetch } from "./auth-fetch";
import { UnauthorizedError } from "./api-errors";
import type { PropertyDetail, PropertyResult } from "./properties-api";

export interface WatchlistItem {
  id: string;
  propertyId: string;
  property: PropertyDetail;
  createdAt: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  count: number;
}

const BASE_URL = "/api/v1/watchlist";

export const watchlistQueryKey = ["watchlist"] as const;

export async function fetchWatchlist(): Promise<WatchlistResponse> {
  const res = await authFetch(BASE_URL);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load watchlist (HTTP ${res.status})`);
  return (await res.json()) as WatchlistResponse;
}

export async function addToWatchlist(propertyId: string): Promise<void> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(propertyId)}`, { method: "POST" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to add property to watchlist (HTTP ${res.status})`);
}

export async function removeFromWatchlist(propertyId: string): Promise<void> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(propertyId)}`, { method: "DELETE" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to remove property from watchlist (HTTP ${res.status})`);
}

/**
 * Adapts a watchlist item's full `PropertyDetail` down to the `PropertyResult`
 * shape `PropertyCard` actually renders — reusing `PropertyCard` here (per
 * the task brief, not building a third property-card-like component) means
 * bridging the one real difference between the two DTOs: detail has a full
 * `riskFlags` array, list has a `riskFlagCount` summary.
 */
export function propertyDetailToResult(property: PropertyDetail): PropertyResult {
  return {
    id: property.id,
    address: property.address,
    county: property.county,
    state: property.state,
    acreage: property.acreage,
    askingPriceCents: property.askingPriceCents,
    landUseType: property.landUseType,
    listingStatus: property.listingStatus,
    lat: property.lat,
    lng: property.lng,
    opportunityScore: property.opportunityScore,
    valuation: property.valuation,
    riskFlagCount: property.riskFlags.length,
  };
}
