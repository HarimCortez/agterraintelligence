/**
 * Saved Searches API client — `GET/POST /v1/saved-searches`,
 * `PATCH/DELETE /v1/saved-searches/:id`. All require a real access token
 * (`JwtAuthGuard`), so every call goes through `authFetch`. Verified against
 * `apps/api/src/saved-searches/dto/saved-search.dto.ts` and
 * `saved-searches.controller.ts`:
 *   - GET returns `{ searches: SavedSearchDto[], count: number }`.
 *   - POST body `{ name, criteria }` -> 201/200 with the created
 *     `SavedSearchDto`.
 *   - PATCH body `{ name?, criteria? }` (at least one) -> the updated DTO.
 *   - DELETE -> 204.
 *
 * `criteria` is typed here as `PropertyFilters` rather than the backend's
 * looser `Record<string, unknown>` — per the task brief, criteria is
 * defined to match `GET /v1/properties`'s query param shape exactly (the
 * same `PropertyFilters` type `properties-api.ts` already uses for
 * Discover's filters), so this file reuses that type/shape rather than
 * inventing a second one.
 */
"use client";

import { authFetch } from "./auth-fetch";
import { UnauthorizedError } from "./api-errors";
import type { PropertyFilters } from "./properties-api";

export interface SavedSearch {
  id: string;
  name: string;
  criteria: PropertyFilters;
  createdAt: string;
  updatedAt: string;
}

export interface SavedSearchesResponse {
  searches: SavedSearch[];
  count: number;
}

const BASE_URL = "/api/v1/saved-searches";

export const savedSearchesQueryKey = ["saved-searches"] as const;

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // Not JSON — fall through to the generic fallback.
  }
  return fallback;
}

export async function fetchSavedSearches(): Promise<SavedSearchesResponse> {
  const res = await authFetch(BASE_URL);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load saved searches (HTTP ${res.status})`);
  return (await res.json()) as SavedSearchesResponse;
}

export async function createSavedSearch(name: string, criteria: PropertyFilters): Promise<SavedSearch> {
  const res = await authFetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, criteria }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await parseErrorMessage(res, "Couldn't save this search. Please try again."));
  return (await res.json()) as SavedSearch;
}

export async function updateSavedSearch(
  id: string,
  input: { name?: string; criteria?: PropertyFilters },
): Promise<SavedSearch> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await parseErrorMessage(res, "Couldn't update this saved search. Please try again."));
  return (await res.json()) as SavedSearch;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to delete saved search (HTTP ${res.status})`);
}
