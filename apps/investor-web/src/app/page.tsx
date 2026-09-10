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
 */
export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const queryClient = new QueryClient();
  const initialFilters = parseFiltersFromSearchParams(searchParams);

  await queryClient.prefetchQuery({
    queryKey: propertiesQueryKey(initialFilters),
    queryFn: () => fetchProperties(initialFilters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DiscoverWorkspace initialFilters={initialFilters} />
    </HydrationBoundary>
  );
}
