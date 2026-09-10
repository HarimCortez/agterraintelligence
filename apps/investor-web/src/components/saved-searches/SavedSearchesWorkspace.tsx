"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSavedSearches,
  deleteSavedSearch,
  updateSavedSearch,
  savedSearchesQueryKey,
  type SavedSearch,
} from "@/lib/saved-searches-api";
import { fetchProperties, propertiesQueryKey, buildQueryString } from "@/lib/properties-api";
import { summarizeCriteria } from "@/lib/criteria-summary";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";

/**
 * `/saved-searches` — lists the current user's saved searches, each with a
 * readable criteria summary, a live match count (re-runs
 * `GET /v1/properties` with that criteria — the same `fetchProperties` /
 * `propertiesQueryKey` Discover uses, via `useQueries`, so a saved search
 * that matches Discover's currently-applied filters shares its cache entry
 * rather than double-fetching), rename, delete, and "View results" (a plain
 * link to `/?<criteria as query params>`, built with the exact same
 * `buildQueryString` Discover's own client uses — see `app/page.tsx` for
 * the corresponding "read filters from the URL on mount" side).
 */
export function SavedSearchesWorkspace() {
  const query = useQuery({
    queryKey: savedSearchesQueryKey,
    queryFn: fetchSavedSearches,
  });
  const handleUnauthorized = useHandleUnauthorized();

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const searches = query.data?.searches ?? [];

  const matchCountQueries = useQueries({
    queries: searches.map((s) => ({
      queryKey: propertiesQueryKey(s.criteria),
      queryFn: () => fetchProperties(s.criteria),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Saved Searches</h1>
        <p className="text-sm text-text-secondary">
          Filter combinations you&apos;ve saved from Discover, with a live count of matching properties.
        </p>
      </header>

      {query.isPending && <LoadingState />}

      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Something went wrong."}
          onRetry={() => query.refetch()}
        />
      )}

      {query.isSuccess && searches.length === 0 && <EmptyState />}

      {query.isSuccess && searches.length > 0 && (
        <div className="flex flex-col gap-md">
          {searches.map((search, i) => (
            <SavedSearchRow key={search.id} search={search} matchCountQuery={matchCountQueries[i]!} />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedSearchRow({
  search,
  matchCountQuery,
}: {
  search: SavedSearch;
  matchCountQuery: { data?: { total: number }; isPending: boolean; isError: boolean };
}) {
  const queryClient = useQueryClient();
  const handleUnauthorized = useHandleUnauthorized();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(search.name);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: savedSearchesQueryKey });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateSavedSearch(search.id, { name }),
    onSuccess: () => {
      invalidate();
      setIsEditing(false);
    },
    // On a non-401 failure, deliberately just leaves the edit form open
    // (no elaborate error UI) so the user can retry or cancel.
    onError: (error) => handleUnauthorized(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSavedSearch(search.id),
    onSuccess: invalidate,
    onError: (error) => handleUnauthorized(error),
  });

  const viewResultsHref = `/?${buildQueryString(search.criteria)}`;

  return (
    <div className="rounded border border-border-subtle bg-surface p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draftName.trim() !== "") renameMutation.mutate(draftName.trim());
              }}
              className="flex items-center gap-sm"
            >
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={100}
                autoFocus
                className="w-full max-w-[280px] rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                aria-label="Saved search name"
              />
              <button
                type="submit"
                disabled={renameMutation.isPending}
                className="rounded bg-action-primary px-sm py-xs text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftName(search.name);
                  setIsEditing(false);
                }}
                className="text-sm text-text-secondary underline hover:text-text-primary"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-sm">
              <h2 className="text-md font-semibold text-text-primary">{search.name}</h2>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs text-action-primary underline hover:opacity-80"
              >
                Rename
              </button>
            </div>
          )}
          <p className="mt-xs text-sm text-text-secondary">{summarizeCriteria(search.criteria)}</p>
          <p className="mt-xs text-sm tabular-nums text-text-secondary">
            {matchCountQuery.isPending && "Checking matches…"}
            {matchCountQuery.isError && "Couldn't check matches"}
            {matchCountQuery.data !== undefined &&
              `${matchCountQuery.data.total} matching ${matchCountQuery.data.total === 1 ? "property" : "properties"}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-md">
          <Link
            href={viewResultsHref}
            className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
          >
            View results
          </Link>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="rounded border border-border-default px-md py-sm text-sm font-semibold text-text-secondary hover:bg-workspace-bg disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-md rounded border border-border-subtle bg-surface p-xl">
      <p className="text-sm text-text-secondary">
        You haven&apos;t saved any searches yet. Apply filters on Discover, then use &quot;Save this
        search&quot; to save the combination here.
      </p>
      <Link
        href="/"
        className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Go to Discover
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-md" role="status" aria-live="polite">
      <span className="sr-only">Loading saved searches…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[104px] animate-pulse rounded border border-border-subtle bg-surface"
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
      <p className="font-semibold">Couldn&apos;t load saved searches</p>
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
