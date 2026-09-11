"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminFulfillmentOrdersQueryKey,
  adminFulfillmentSummaryQueryKey,
  fetchAdminFulfillmentOrders,
  fetchAdminFulfillmentSummary,
  retryFulfillmentOrder,
} from "@/lib/admin-fulfillment-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;
const REPORT_ORDER_STATUSES = [
  "pending_payment",
  "queued",
  "generating",
  "awaiting_review",
  "approved",
  "delivered",
  "failed",
  "refunded",
];

/**
 * `/fulfillment` — Report Fulfillment (REQUIREMENTS.md Section C.3): order
 * pipeline visibility, average fulfillment time, and retrying a `failed`
 * order. See `admin-report-fulfillment.service.ts`'s doc comment for
 * what's deliberately not here (refunds, PDF download).
 */
export function FulfillmentWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const summaryQuery = useQuery({
    queryKey: adminFulfillmentSummaryQueryKey,
    queryFn: fetchAdminFulfillmentSummary,
  });

  const params = { status: status || undefined, limit: PAGE_SIZE, offset };
  const ordersQuery = useQuery({
    queryKey: adminFulfillmentOrdersQueryKey(params),
    queryFn: () => fetchAdminFulfillmentOrders(params),
  });

  useEffect(() => {
    if (summaryQuery.error) handleUnauthorized(summaryQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.error]);
  useEffect(() => {
    if (ordersQuery.error) handleUnauthorized(ordersQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersQuery.error]);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retryMutation = useMutation({
    mutationFn: retryFulfillmentOrder,
    onMutate: (id) => setRetryingId(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-fulfillment"] });
    },
    onError: handleUnauthorized,
    onSettled: () => setRetryingId(null),
  });

  if (summaryQuery.isError && summaryQuery.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {summaryQuery.error.message}
        </div>
      </div>
    );
  }

  const summary = summaryQuery.data;

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Report Fulfillment</h1>
        <p className="text-sm text-text-secondary">Pipeline status, fulfillment time, and failed-order retry.</p>
      </header>

      <section className="mb-xl grid grid-cols-1 gap-md sm:grid-cols-3">
        <KpiCard
          label="Avg. fulfillment time"
          value={
            summaryQuery.isPending
              ? "…"
              : summary?.averageFulfillmentSeconds == null
                ? "No delivered orders yet"
                : formatDuration(summary.averageFulfillmentSeconds)
          }
        />
        <KpiCard label="Failed orders (needs attention)" value={summaryQuery.isPending ? "…" : String(summary?.failedOrderCount ?? 0)} />
        <KpiCard
          label="In progress"
          value={
            summaryQuery.isPending
              ? "…"
              : String(
                  (summary?.ordersByStatus["queued"] ?? 0) +
                    (summary?.ordersByStatus["generating"] ?? 0) +
                    (summary?.ordersByStatus["awaiting_review"] ?? 0),
                )
          }
        />
      </section>

      <div className="mb-md flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Orders</h2>
        <select
          className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          {REPORT_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatEnumLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">User</th>
              <th className="px-md py-sm">Property</th>
              <th className="px-md py-sm">Tier</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Updated</th>
              <th className="px-md py-sm" />
            </tr>
          </thead>
          <tbody>
            {ordersQuery.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {ordersQuery.isSuccess && ordersQuery.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  No orders match these filters.
                </td>
              </tr>
            )}
            {ordersQuery.isSuccess &&
              ordersQuery.data.results.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-md py-sm text-text-primary">{row.userEmail}</td>
                  <td className="px-md py-sm text-text-primary">
                    <Link href={`/fulfillment/${row.id}`} className="text-action-primary underline">
                      {row.propertyAddress}
                    </Link>
                  </td>
                  <td className="px-md py-sm capitalize text-text-primary">{row.reportTierCode}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(row.status)}</td>
                  <td className="px-md py-sm text-text-secondary">{formatDate(row.updatedAt)}</td>
                  <td className="px-md py-sm text-right">
                    {row.status === "failed" && (
                      <button
                        type="button"
                        disabled={retryMutation.isPending && retryingId === row.id}
                        onClick={() => retryMutation.mutate(row.id)}
                        className="rounded border border-border-default px-sm py-xs text-xs font-semibold text-text-primary hover:bg-workspace-bg disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {retryMutation.isPending && retryingId === row.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {retryMutation.isError && !(retryMutation.error instanceof Error && retryMutation.error.name === "UnauthorizedError") && (
        <p role="alert" className="mt-sm text-sm text-risk-high-bg">
          {retryMutation.error instanceof Error ? retryMutation.error.message : "Retry failed."}
        </p>
      )}

      {(ordersQuery.data?.total ?? 0) > 0 && (
        <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, ordersQuery.data!.total)} of {ordersQuery.data!.total}
          </span>
          <div className="flex gap-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= ordersQuery.data!.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-lg">
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">{label}</p>
      <p className="mt-xs text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${(seconds / 60).toFixed(1)}m`;
}
