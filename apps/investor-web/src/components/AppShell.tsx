"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNavRail } from "@agterra/ui";
import { useComparisonStore } from "@/lib/comparison-store";
import { useAuthStore } from "@/lib/auth-store";
import { ComparisonTrayIndicator } from "./ComparisonTrayIndicator";
import { AuthNavSection } from "./AuthNavSection";
import { AuthenticatedNavLinks } from "./AuthenticatedNavLinks";

/**
 * App shell — nav rail + persistent comparison tray indicator, rendered once
 * in the root layout (`app/layout.tsx`) rather than duplicated inside each
 * page's own component tree. Previously `DiscoverWorkspace`, `PropertyDetailView`,
 * and the property-detail `not-found.tsx` each rendered their own
 * `<AppNavRail>` independently; per REQUIREMENTS.md's cross-cutting rule
 * ("Compare adds property to a persistent comparison tray available across
 * the app") and ARCHITECTURE.md's "persisted client-side and rehydrated
 * app-wide" comparison tray, the tray indicator needs one true shared home
 * alongside the nav rail — not a second page-local copy — so this refactor
 * consolidates both here.
 *
 * Client component (not the root layout itself) because it needs
 * `usePathname` for the active nav item and mounts the one-time comparison
 * store rehydration effect (see `comparison-store.ts` for why rehydration is
 * manual/deferred rather than automatic).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    void useComparisonStore.persist.rehydrate();
    void useAuthStore.persist.rehydrate();
  }, []);

  // Only "Discover" is a plain `AppNavRail` `items` entry — every other
  // route (`/compare`, `/watchlist`, `/saved-searches`) needs a real link,
  // which `items` (label + active flag only, no href) can't express, so
  // those are rendered as `children` instead: `ComparisonTrayIndicator` and
  // `AuthenticatedNavLinks` below.
  const items = [{ label: "Discover", active: pathname === "/" }];

  return (
    <div className="flex min-h-screen bg-workspace-bg">
      <AppNavRail items={items}>
        <AuthenticatedNavLinks />
        <ComparisonTrayIndicator />
        <AuthNavSection />
      </AppNavRail>

      <main className="flex-1">{children}</main>
    </div>
  );
}
