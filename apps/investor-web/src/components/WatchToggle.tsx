"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StarFilledIcon } from "@agterra/ui";
import { useAuthStore } from "@/lib/auth-store";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";
import { addToWatchlist, removeFromWatchlist, fetchWatchlist, watchlistQueryKey } from "@/lib/watchlist-api";

interface WatchToggleProps {
  propertyId: string;
  className?: string;
}

/**
 * Watch star — adds/removes a single property from the current user's real
 * backend-persisted watchlist (`GET/POST/DELETE /v1/watchlist`), via
 * `useMutation`, never local-only state. Deliberately a `<button>` +
 * filled/outline star (not `CompareToggle`'s checkbox) in a gold accent
 * (`text-gold-accent`, the same token used for the Exceptional score band)
 * rather than `CompareToggle`'s blue checkbox, so the two toggles read as
 * visually distinct actions, not two copies of the same control.
 *
 * Logged-out click: per the task brief's "graceful, not broken" bar, this
 * redirects straight to `/login` rather than firing a request that would
 * 401 — no toggle state changes, no error is ever surfaced from a call
 * that was never made.
 *
 * Mid-session expiry (a logged-in user's access token has expired):
 * `useHandleUnauthorized` catches the mutation's real `401` and redirects
 * the same way, via `logout()` + `/login`, consistent with the "no silent
 * refresh, expiry just means log in again" decision.
 */
export function WatchToggle({ propertyId, className = "" }: WatchToggleProps) {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const handleUnauthorized = useHandleUnauthorized();

  // Shared cache entry with `WatchlistWorkspace` (same query key) — only
  // one real network request fires even if many `WatchToggle`s are mounted
  // at once (e.g. every card on Discover), and only when actually logged
  // in (an anonymous visitor should never trigger an authenticated fetch).
  const watchlistQuery = useQuery({
    queryKey: watchlistQueryKey,
    queryFn: fetchWatchlist,
    enabled: !!user,
    staleTime: 30_000,
  });

  const isWatched = watchlistQuery.data?.items.some((item) => item.propertyId === propertyId) ?? false;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: watchlistQueryKey });

  const addMutation = useMutation({
    mutationFn: () => addToWatchlist(propertyId),
    onSuccess: invalidate,
    onError: (error) => handleUnauthorized(error),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeFromWatchlist(propertyId),
    onSuccess: invalidate,
    onError: (error) => handleUnauthorized(error),
  });

  const pending = addMutation.isPending || removeMutation.isPending;

  const handleClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (isWatched) {
      removeMutation.mutate();
    } else {
      addMutation.mutate();
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleClick();
      }}
      disabled={pending}
      aria-pressed={isWatched}
      title={user ? undefined : "Log in to watch properties"}
      className={`inline-flex items-center gap-xs text-sm font-semibold transition-colors ${
        isWatched ? "text-gold-accent" : "text-text-secondary hover:text-gold-accent"
      } disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <StarFilledIcon className={isWatched ? "opacity-100" : "opacity-30"} />
      <span>{isWatched ? "Watching" : "Watch"}</span>
    </button>
  );
}
