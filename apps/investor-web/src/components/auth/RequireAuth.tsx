"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Protected-route gate — wrap any page's client content in this to require
 * a logged-in user, redirecting to `/login` otherwise.
 *
 * Ordering matters here: `useAuthStore`'s `hasHydrated` flag (see that
 * file's doc comment) starts `false` on every fresh page load and only
 * flips `true` once `AppShell`'s manual `.persist.rehydrate()` call
 * resolves. Redirecting on `!user` before that would incorrectly bounce an
 * already-logged-in user (whose session lives in `localStorage`, not yet
 * read back into the store) to `/login` on every single page load — so
 * this renders a neutral loading state and does nothing until
 * `hasHydrated` is `true`, then redirects only if `user` is still `null`.
 *
 * This is a UX convenience only, not an authorization boundary: it decides
 * what the browser *shows*, not what the API allows. The backend's
 * `JwtAuthGuard` on every watchlist/saved-search endpoint is what actually
 * enforces authorization regardless of whether this component ever runs.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && !user) {
      router.replace("/login");
    }
  }, [hasHydrated, user, router]);

  if (!hasHydrated || !user) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-xl" role="status" aria-live="polite">
        <span className="sr-only">Checking your session…</span>
        <div className="h-8 w-8 animate-pulse rounded-full bg-border-default" aria-hidden="true" />
      </div>
    );
  }

  return <>{children}</>;
}
