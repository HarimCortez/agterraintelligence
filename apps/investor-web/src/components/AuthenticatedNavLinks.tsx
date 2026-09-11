"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Nav-rail links to the two logged-in-only screens (`/watchlist`,
 * `/saved-searches`), rendered inside `AppShell` alongside
 * `ComparisonTrayIndicator`. Only rendered once the auth store has
 * rehydrated *and* found a real user — before that (or for a logged-out
 * visitor), these routes exist but aren't reachable from the nav, since
 * `RequireAuth` would just bounce a logged-out click straight back to
 * `/login` anyway. Matches `ComparisonTrayIndicator`'s Link-based pattern
 * rather than the plain-span `AppNavRail` `items` (which have no per-item
 * href support).
 */
export function AuthenticatedNavLinks() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  if (!hasHydrated || !user) return null;

  return (
    <>
      <Link
        href="/watchlist"
        className={`flex items-center rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
          pathname === "/watchlist" ? "font-semibold text-nav-text" : "text-nav-text-muted"
        }`}
      >
        Watchlist
      </Link>
      <Link
        href="/saved-searches"
        className={`flex items-center rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
          pathname === "/saved-searches" ? "font-semibold text-nav-text" : "text-nav-text-muted"
        }`}
      >
        Saved Searches
      </Link>
      <Link
        href="/account"
        className={`flex items-center rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
          pathname === "/account" ? "font-semibold text-nav-text" : "text-nav-text-muted"
        }`}
      >
        Account
      </Link>
    </>
  );
}
