"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Logged-in/out affordance in the nav rail, rendered inside `AppShell`
 * alongside `ComparisonTrayIndicator`. Passed as a second child to
 * `AppNavRail` — no change to that design-system component needed, since
 * its `children` prop already accepts arbitrary `ReactNode`.
 *
 * Relies on the same skipHydration + `AppShell`-triggered-rehydrate pattern
 * as the comparison tray (see `comparison-store.ts`'s header comment):
 * before rehydration, the store's default state (`user: null`) matches
 * what the server rendered, so there's no hydration mismatch — the
 * "Log in" link swaps to the user's email + "Log out" once `AppShell`'s
 * effect rehydrates from `localStorage` after mount.
 */
export function AuthNavSection() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  if (!user) {
    return (
      <Link
        href="/login"
        className="mt-sm flex items-center rounded px-sm py-sm text-sm text-nav-text-muted transition-colors hover:bg-white/10 hover:text-nav-text"
      >
        Log in
      </Link>
    );
  }

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="mt-sm flex flex-col gap-xs px-sm py-sm text-sm">
      <span className="truncate text-nav-text-muted" title={user.email}>
        {user.email}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="self-start text-nav-text-muted underline hover:text-nav-text"
      >
        Log out
      </button>
    </div>
  );
}
