/** Mirrors investor-web's `auth-fetch.ts` — see that file's doc comment. Attaches the admin bearer token, not the investor one. */
"use client";

import { useAdminAuthStore } from "./admin-auth-store";

export async function adminAuthFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = useAdminAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return fetch(url, { ...init, headers });
}
