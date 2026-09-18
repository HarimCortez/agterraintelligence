import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { DiscoverWorkspace } from "@/components/discover/DiscoverWorkspace";
import { fetchProperties, parseFiltersFromSearchParams, propertiesQueryKey } from "@/lib/properties-api";

interface DiscoverPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Discover + Map Workspace (v1) — the investor Discover screen.
 *
 * Server Component: prefetches results on the server and dehydrates them
 * into the client-side TanStack Query cache via `HydrationBoundary`, so the
 * initial HTML response already contains real property data instead of a
 * client-only loading spinner. Server-side fetch calls the API directly
 * (server-to-server, not subject to browser CORS); subsequent client-side
 * filter changes go through `/api/*`, which next.config.mjs rewrites to the
 * API same-origin.
 *
 * Initial filters come from `searchParams` (via `parseFiltersFromSearchParams`,
 * falling back to `DEFAULT_FILTERS` when nothing/nothing valid is present)
 * rather than always the unfiltered default — this is what makes
 * `/saved-searches`' "View results" (a plain link to
 * `/?<criteria as query params>`) actually apply the saved filters, and as
 * a side effect makes any Discover URL bookmarkable/shareable.
 *
 * `editSavedSearchId`/`editSavedSearchName` are an optional pair of extra
 * query params `/saved-searches`' "Edit filters" link adds on top of the
 * same criteria-as-query-params shape "View results" already used —
 * `parseFiltersFromSearchParams` ignores unknown keys, so this doesn't
 * disturb that parsing; it's read separately here and threaded through to
 * `FilterPanel` so editing a saved search's filters can write back via
 * `PATCH /v1/saved-searches/:id` instead of only ever creating a new one.
 */
export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const queryClient = new QueryClient();
  const initialFilters = parseFiltersFromSearchParams(searchParams);

  const editSavedSearchId = firstParam(searchParams.editSavedSearchId);
  const editSavedSearchName = firstParam(searchParams.editSavedSearchName);

  await queryClient.prefetchQuery({
    queryKey: propertiesQueryKey(initialFilters),
    queryFn: () => fetchProperties(initialFilters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DiscoverWorkspace
        initialFilters={initialFilters}
        editSavedSearchId={editSavedSearchId}
        editSavedSearchName={editSavedSearchName}
      />
    </HydrationBoundary>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
