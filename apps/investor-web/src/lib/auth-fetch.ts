/**
 * Thin wrapper around `fetch` that attaches `Authorization: Bearer
 * <accessToken>` read from the auth store. For future protected
 * client-side calls (e.g. Watchlist/Saved-Search, a follow-up dispatch) —
 * not used by anything in this pass yet.
 *
 * Per REQUIREMENTS.md's decision log item 8 (no silent token-refresh in
 * this pass), this deliberately does NOT retry on 401 with a refreshed
 * token. A 401 here just means "the access token is missing or expired";
 * callers are expected to treat that as "you're logged out" and redirect
 * to `/login` themselves — that redirect wiring is each protected page's
 * own responsibility, not this helper's.
 *
 * This is a UX convenience only, not an authorization boundary: whether a
 * request actually succeeds is enforced by the backend regardless of
 * whether a token is attached here.
 */
"use client";

import { useAuthStore } from "./auth-store";

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(url, { ...init, headers });
}
