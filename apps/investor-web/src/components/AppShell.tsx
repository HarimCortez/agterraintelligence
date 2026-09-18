"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
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

  // `AppNavRail`'s `items` (label + active flag only, no href) can't express
  // a real link, so every nav-rail entry — including "Discover" — is
  // rendered as a `children` link instead, matching `AuthenticatedNavLinks`'
  // established pattern. This also fixes a real dead end: previously
  // "Discover" was inert text, leaving no nav-rail way back to it from
  // `/compare`, `/watchlist`, `/account`, or `/support` (see the customer-
  // journey UX audit's finding #1).
  const isDiscoverActive = pathname === "/";

  return (
    <div className="flex min-h-screen bg-workspace-bg">
      <AppNavRail items={[]} logoHref="/">
        <Link
          href="/"
          className={`flex items-center rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
            isDiscoverActive ? "font-semibold text-nav-text" : "text-nav-text-muted"
          }`}
        >
          Discover
        </Link>
        <AuthenticatedNavLinks />
        <ComparisonTrayIndicator />
        <AuthNavSection />
      </AppNavRail>

      <main className="flex-1">{children}</main>
    </div>
  );
}
