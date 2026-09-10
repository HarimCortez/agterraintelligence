"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PropertyCard } from "@/components/discover/PropertyCard";
import { fetchWatchlist, watchlistQueryKey, propertyDetailToResult } from "@/lib/watchlist-api";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";

/**
 * `/watchlist` — lists the current user's watched properties, fetched live
 * from `GET /v1/watchlist` (never local-only state). Rendered inside
 * `RequireAuth` by `app/watchlist/page.tsx`, so by the time this mounts a
 * real `user` is guaranteed.
 *
 * Reuses `PropertyCard` (the same component Discover renders) rather than
 * a parallel "watchlist card" — per the task brief. `PropertyCard` already
 * renders a `WatchToggle` (added alongside `CompareToggle`), so unwatching a
 * property directly from its card here doubles as this page's
 * remove-from-watchlist action: no separate "Remove" button needed, and it
 * shares the same `watchlistQueryKey` cache entry `WatchToggle` mutates, so
 * the list updates immediately on un-watch.
 */
export function WatchlistWorkspace() {
  const query = useQuery({
    queryKey: watchlistQueryKey,
    queryFn: fetchWatchlist,
  });
  const handleUnauthorized = useHandleUnauthorized();

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Watchlist</h1>
        <p className="text-sm text-text-secondary">Properties you&apos;re keeping an eye on.</p>
      </header>

      {query.isPending && <LoadingState />}

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Something went wrong."}
          onRetry={() => query.refetch()}
        />
      )}

      {query.isSuccess && query.data.items.length === 0 && <EmptyState />}

      {query.isSuccess && query.data.items.length > 0 && (
        <div className="flex flex-col gap-lg">
          {query.data.items.map((item) => (
            <PropertyCard key={item.id} property={propertyDetailToResult(item.property)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-md rounded border border-border-subtle bg-surface p-xl">
      <p className="text-sm text-text-secondary">
        You haven&apos;t watched any properties yet. Watch a property from Discover or a Property
        Intelligence Page to track it here.
      </p>
      <Link
        href="/"
        className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Browse properties on Discover
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-lg" role="status" aria-live="polite">
      <span className="sr-only">Loading watchlist…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[132px] animate-pulse rounded border border-border-subtle bg-surface"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
    >
      <p className="font-semibold">Couldn&apos;t load your watchlist</p>
      <p className="text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
