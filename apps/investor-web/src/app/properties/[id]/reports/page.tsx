import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportSelectionWorkspace } from "@/components/reports/ReportSelectionWorkspace";
import { fetchPropertyById, propertyQueryKey, PropertyNotFoundError } from "@/lib/properties-api";

interface ReportSelectionPageProps {
  params: { id: string };
}

/**
 * `/properties/[id]/reports` — Report Selection & Purchase (Screen 1), per
 * the UX doc's route decision (a real URL, not a modal). Server Component:
 * prefetches `GET /v1/properties/:id` the same way `/properties/[id]/page.tsx`
 * does (property address/back-link context is public data, no reason to
 * wait on a client fetch for it) and seeds it into the TanStack Query cache
 * via `HydrationBoundary`. Report tiers, pricing, and this investor's
 * existing orders are fetched client-side by `ReportSelectionWorkspace`
 * (tiers are public but cheap to just fetch client-side too; pricing/orders
 * are authenticated and only relevant once `useAuthStore` has rehydrated).
 *
 * 404/400 both resolve to Next's `notFound()`, same rationale as the
 * Property Intelligence Page.
 */
export default async function ReportSelectionPage({ params }: ReportSelectionPageProps) {
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
      {/*
        Finding 3 fix: `ReportSelectionWorkspace` reads the `?tier=` resume
        param via `useSearchParams()` (see that component for the full
        rationale) — Next's App Router requires a Suspense boundary around
        any Client Component call to `useSearchParams()` so the route
        doesn't fully deopt to client-side rendering.
      */}
      <Suspense fallback={null}>
        <ReportSelectionWorkspace propertyId={id} />
      </Suspense>
    </HydrationBoundary>
  );
}
