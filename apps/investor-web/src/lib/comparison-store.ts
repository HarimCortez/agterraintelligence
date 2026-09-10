/**
 * Global comparison tray — Zustand store, persisted to `localStorage`.
 *
 * Lives in `apps/investor-web/src/lib` (not `packages/ui`) because the tray
 * is investor-web-specific client *state* (property IDs + cap enforcement),
 * not a presentational design-system component — `admin-web` has no
 * property-comparison feature, so there's no cross-app reuse need that would
 * justify putting it in the shared UI package. The *indicator* and *toggle*
 * components that read this store are plain React and could move to
 * `packages/ui` later if admin-web ever needed an equivalent, but the store
 * itself stays app-local.
 *
 * Per ARCHITECTURE.md's stack table: "Zustand's small persisted store is a
 * natural fit for the explicitly required 'persistent comparison tray...
 * available across the app.'" Per REQUIREMENTS.md's comparison-workspace
 * boundary (2-6 properties), the cap is enforced at 6 here — `add` past the
 * cap is a deliberate no-op (not a silent truncate/replace of an existing
 * entry), so callers (the Compare toggle) are expected to disable themselves
 * once `isFull` is true rather than call `add` and have it silently fail.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const COMPARISON_TRAY_LIMIT = 6;

interface ComparisonState {
  propertyIds: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set, get) => ({
      propertyIds: [],
      add: (id) => {
        const { propertyIds } = get();
        if (propertyIds.includes(id)) return;
        if (propertyIds.length >= COMPARISON_TRAY_LIMIT) return;
        set({ propertyIds: [...propertyIds, id] });
      },
      remove: (id) =>
        set((state) => ({ propertyIds: state.propertyIds.filter((pid) => pid !== id) })),
      clear: () => set({ propertyIds: [] }),
    }),
    {
      name: "agterra-comparison-tray",
      // `skipHydration: true` + the manual `.persist.rehydrate()` call in
      // `AppShell` (root layout) is deliberate, not an oversight: zustand's
      // default persist behavior rehydrates from `localStorage`
      // *synchronously during store creation*, which on the client happens
      // before React's first hydration pass — producing a server/client HTML
      // mismatch (SSR always renders the tray empty; the client's first
      // render would otherwise already reflect real localStorage content).
      // Skipping auto-hydration keeps the client's first render identical to
      // the server's (empty), then `AppShell`'s `useEffect` triggers the real
      // rehydration once mounted, matching the SSR-safe pattern zustand's own
      // Next.js docs recommend for `persist`.
      skipHydration: true,
    },
  ),
);
