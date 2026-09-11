/**
 * Global admin auth session — Zustand store, persisted to `localStorage`
 * under its own key (`agterra-admin-auth-session`, distinct from
 * investor-web's `agterra-auth-session` — separate origin/app anyway, but
 * named distinctly for clarity). Same skipHydration + manual
 * `.persist.rehydrate()` pattern as investor-web's `auth-store.ts` — read
 * that file's header comment for why. Same no-silent-refresh rule too: the
 * access token is used as-is until it expires, then the admin logs in
 * again.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { logoutAdmin, type AdminAuthTokens, type AdminAuthUser } from "./admin-auth-api";

interface AdminAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  adminUser: AdminAuthUser | null;
  hasHydrated: boolean;
  setSession: (session: AdminAuthTokens) => void;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      adminUser: null,
      hasHydrated: false,
      setSession: ({ accessToken, refreshToken, adminUser }) => set({ accessToken, refreshToken, adminUser }),
      logout: () => {
        const { refreshToken } = get();
        set({ accessToken: null, refreshToken: null, adminUser: null });
        if (refreshToken) {
          void logoutAdmin(refreshToken).catch(() => {
            // Best-effort only, same rationale as investor-web's logout().
          });
        }
      },
    }),
    {
      name: "agterra-admin-auth-session",
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn("Failed to rehydrate admin auth session from storage", error);
        }
        useAdminAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
