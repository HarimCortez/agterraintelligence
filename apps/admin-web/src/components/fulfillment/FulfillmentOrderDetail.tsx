"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminFulfillmentOrderDetailQueryKey,
  fetchAdminFulfillmentOrderDetail,
  retryFulfillmentOrder,
} from "@/lib/admin-fulfillment-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatCurrencyFromCents, formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

/**
 * `/fulfillment/:id` — full order detail including the persisted AI
 * report `content` JSON. This is the admin substitute for "download" —
 * REQUIREMENTS.md decision log #10 defers real PDF rendering; a report is
 * a page in the app, not a file, so viewing the raw content here is the
 * real equivalent, not a stand-in for a missing feature.
 */
export function FulfillmentOrderDetail({ orderId }: { orderId: string }) {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: adminFulfillmentOrderDetailQueryKey(orderId),
    queryFn: () => fetchAdminFulfillmentOrderDetail(orderId),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const retryMutation = useMutation({
    mutationFn: () => retryFulfillmentOrder(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminFulfillmentOrderDetailQueryKey(orderId) });
    },
    onError: handleUnauthorized,
  });

  if (query.isError && query.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {query.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-xl">
      <Link href="/fulfillment" className="mb-lg inline-block text-sm text-action-primary underline">
        ← Back to Report Fulfillment
      </Link>

      {query.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      {query.isError && !(query.error instanceof ForbiddenError) && (
        <p className="text-sm text-text-secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load this order."}
        </p>
      )}

      {query.isSuccess && (
        <>
          <header className="mb-lg">
            <h1 className="text-2xl font-semibold text-text-primary">{query.data.propertyAddress}</h1>
            <p className="text-sm text-text-secondary">{query.data.userEmail}</p>
          </header>

          <section className="mb-xl grid grid-cols-1 gap-md rounded border border-border-subtle bg-surface p-lg sm:grid-cols-2">
            <Field label="Status" value={formatEnumLabel(query.data.status)} />
            <Field label="Tier" value={query.data.reportTierCode} />
            <Field label="Price paid" value={formatCurrencyFromCents(query.data.pricePaidCents)} />
            <Field label="Price basis" value={formatEnumLabel(query.data.priceBasis)} />
            <Field label="Created" value={formatDate(query.data.createdAt)} />
            <Field label="Last updated" value={formatDate(query.data.updatedAt)} />
          </section>

          {query.data.status === "failed" && (
            <div className="mb-xl">
              <button
                type="button"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
                className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryMutation.isPending ? "Retrying…" : "Retry generation"}
              </button>
              {retryMutation.isError && !(retryMutation.error instanceof ForbiddenError) && (
                <p role="alert" className="mt-sm text-sm text-risk-high-bg">
                  {retryMutation.error instanceof Error ? retryMutation.error.message : "Retry failed."}
                </p>
              )}
            </div>
          )}

          <section>
            <h2 className="mb-md text-lg font-semibold text-text-primary">Report content</h2>
            {query.data.content ? (
              <pre className="overflow-x-auto rounded border border-border-subtle bg-surface p-lg text-xs text-text-primary">
                {JSON.stringify(query.data.content, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-text-secondary">No content generated yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">{label}</p>
      <p className="text-sm capitalize text-text-primary">{value}</p>
    </div>
  );
}
