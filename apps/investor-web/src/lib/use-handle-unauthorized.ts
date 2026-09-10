/**
 * Shared "your session is gone, deal with it" reaction used by every
 * authenticated mutation/query in the app (watchlist, saved searches).
 * Clears the local session (so the nav rail / any other component
 * reflects logged-out immediately) and sends the user to `/login` — the
 * same outcome as an explicit logout, since per REQUIREMENTS.md's decision
 * log item 8 there is no silent token-refresh to attempt first.
 */
"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "./auth-store";
import { UnauthorizedError } from "./api-errors";

export function useHandleUnauthorized() {
  const router = useRouter();

  return (error: unknown) => {
    if (error instanceof UnauthorizedError) {
      useAuthStore.getState().logout();
      router.push("/login");
      return true;
    }
    return false;
  };
}
