import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { PropertyDetailView } from "@/components/property-detail/PropertyDetailView";
import { fetchPropertyById, propertyQueryKey, PropertyNotFoundError } from "@/lib/properties-api";

interface PropertyDetailPageProps {
  params: { id: string };
}

/**
 * Property Intelligence Page (v1) — `/properties/[id]`.
 *
 * Server Component: fetches `GET /v1/properties/:id` server-side (same
 * server-to-server, no-CORS rationale as Discover's `page.tsx`), so the
 * initial HTML already contains the real property data. The fetch result is
 * seeded directly into the TanStack Query cache via `setQueryData` (rather
 * than a second `prefetchQuery` call) since we already need the resolved
 * value here to decide whether to render `notFound()` — no reason to fetch
 * twice. That cache is dehydrated into `HydrationBoundary` so the client
 * component picks up the same data without an extra request, matching
 * Discover's SSR-prefetch pattern.
 *
 * 404 (property not found) and 400 (`:id` not a valid UUID) both resolve to
 * Next's `notFound()` — from a user's perspective both mean "there's no
 * Property Intelligence Page here," see `PropertyNotFoundError` for the
 * reasoning on why the API's two distinct error codes collapse to one UI
 * state.
 */
export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = params;
  const queryClient = new QueryClient();

  let property;
  try {
    property = await fetchPropertyById(id);
  } catch (error) {
    if (error instanceof PropertyNotFoundError) {
      notFound();
    }
    throw error;
  }

  queryClient.setQueryData(propertyQueryKey(id), property);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PropertyDetailView id={id} />
    </HydrationBoundary>
  );
}
