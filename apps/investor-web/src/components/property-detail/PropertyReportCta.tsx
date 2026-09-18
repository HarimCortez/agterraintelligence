"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import {
  fetchReportTiers,
  fetchPropertyReportOrders,
  highestDeliveredOrder,
  reportTiersQueryKey,
  propertyReportOrdersQueryKey,
} from "@/lib/report-orders-api";

interface PropertyReportCtaProps {
  propertyId: string;
}

/**
 * "Unlock Report" entry-point section — placed after the Opportunity Score
 * hero, before Valuation, per the UX doc's exact placement instruction.
 * Three CTA variants (see the UX doc's "Entry point" table); the section
 * itself never disappears, only the CTA content swaps.
 *
 * Data needed to pick the variant (`GET /v1/properties/:id/reports`) is
 * fetched here for authenticated users only (`enabled: !!user`, matching
 * `WatchToggle`). While pending or on error, this renders the "no report
 * owned" default CTA rather than a spinner/error — the UX doc's explicit
 * instruction: it's the statistically correct first-paint guess and avoids
 * a layout-shifting loading state on the page's highest-visibility CTA; if
 * the query later resolves to "owns a report," the CTA swaps in place.
 */
export function PropertyReportCta({ propertyId }: PropertyReportCtaProps) {
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const tiersQuery = useQuery({ queryKey: reportTiersQueryKey, queryFn: fetchReportTiers });
  const ordersQuery = useQuery({
    queryKey: propertyReportOrdersQueryKey(propertyId),
    queryFn: () => fetchPropertyReportOrders(propertyId),
    enabled: hasHydrated && !!user,
  });

  const delivered = ordersQuery.data?.filter((o) => o.status === "delivered") ?? [];

  let variant: "none" | "owns-lower" | "owns-top" = "none";
  let highestOrderId: string | null = null;

  if (hasHydrated && user && ordersQuery.isSuccess && delivered.length > 0 && tiersQuery.isSuccess) {
    const highest = highestDeliveredOrder(tiersQuery.data, delivered);
    if (highest) {
      highestOrderId = highest.id;
      const highestTier = tiersQuery.data.find((t) => t.code === highest.reportTierCode);
      const topPurchasableTier = tiersQuery.data
        .filter((t) => t.purchasable)
        .sort((a, b) => b.sortOrder - a.sortOrder)[0];
      const isAtOrAboveTop =
        !!highestTier && !!topPurchasableTier && highestTier.sortOrder >= topPurchasableTier.sortOrder;
      variant = isAtOrAboveTop ? "owns-top" : "owns-lower";
    }
  }

  return (
    <section aria-label="Purchased report" className="rounded border border-border-subtle bg-surface p-lg">
      <div className="flex flex-wrap items-center gap-md">
        {variant === "none" && (
          <Link
            href={`/properties/${propertyId}/reports`}
            className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
          >
            Unlock Full Report
          </Link>
        )}
        {variant === "owns-lower" && (
          <>
            <Link
              href={`/report-orders/${highestOrderId}`}
              className="rounded border border-action-primary px-md py-sm text-sm font-semibold text-action-primary hover:bg-workspace-bg"
            >
              View Your Report
            </Link>
            <Link
              href={`/properties/${propertyId}/reports`}
              className="text-sm font-semibold text-action-primary hover:underline"
            >
              Upgrade for deeper analysis
            </Link>
          </>
        )}
        {variant === "owns-top" && (
          <Link
            href={`/report-orders/${highestOrderId}`}
            className="rounded border border-action-primary px-md py-sm text-sm font-semibold text-action-primary hover:bg-workspace-bg"
          >
            View Your Report
          </Link>
        )}
      </div>
      <p className="mt-sm text-sm text-text-secondary">
        A purchased report is a persisted, deeper AI-generated investment analysis of this property — yours
        to revisit anytime.
      </p>
    </section>
  );
}
