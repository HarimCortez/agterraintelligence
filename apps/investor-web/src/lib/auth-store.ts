/**
 * Global auth session — Zustand store, persisted to `localStorage`. Same
 * persist/skipHydration convention as `comparison-store.ts` (read that
 * file's header comment for why `skipHydration: true` + a manual
 * `.persist.rehydrate()` call from `AppShell`'s `useEffect` is required
 * here, not optional): zustand's default persist behavior rehydrates
 * synchronously during store creation, which on the client happens before
 * React's first hydration pass and would otherwise produce a
 * server/client HTML mismatch (SSR always renders logged-out; the client's
 * first render would otherwise already reflect a real stored session).
 *
 * Per REQUIREMENTS.md's decision log item 8, this pass deliberately does
 * NOT wire up silent token-refresh — the access token is used as-is until
 * it expires (15 min default), at which point the user must log in again.
 * There is no refresh-rotation flow here to build.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { logoutUser, type AuthTokens, type AuthUser } from "./auth-api";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /**
   * False until `AppShell`'s manual `.persist.rehydrate()` call (see
   * `skipHydration` note above) has actually completed — set via
   * `onRehydrateStorage` below, which zustand's persist middleware invokes
   * once rehydration resolves (whether or not it finds anything in
   * `localStorage`) even though `skipHydration` defers *when* that
   * rehydration runs. Protected-route gating (`RequireAuth`) reads this to
   * avoid bouncing an already-logged-in user to `/login` on every page
   * load — before this flips true, `user` is always still `null` (the
   * server-matching default), which is indistinguishable from "really
   * logged out" without this flag.
   */
  hasHydrated: boolean;
  setSession: (session: AuthTokens) => void;
  /**
   * Clears local session state synchronously (the UI reflects "logged out"
   * immediately) and separately fires a best-effort call to the real
   * `/v1/auth/logout` endpoint with the refresh token that was just
   * cleared — but does not await it and swallows any failure, since the
   * UI-visible logout must never block on or be reverted by a network
   * call. See `logoutUser`'s doc comment for why the API's idempotent
   * handling means there's nothing to react to either way.
   */
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      logout: () => {
        const { refreshToken } = get();
        set({ accessToken: null, refreshToken: null, user: null });
        if (refreshToken) {
          void logoutUser(refreshToken).catch(() => {
            // Best-effort only — see doc comment above.
          });
        }
      },
    }),
    {
      name: "agterra-auth-session",
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        // Runs after `AppShell`'s `.persist.rehydrate()` call resolves,
        // success or failure — either way, we now know the real session
        // state (or lack thereof), so protected routes are safe to act on
        // `user` being null.
        if (error) {
          console.warn("Failed to rehydrate auth session from storage", error);
        }
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
