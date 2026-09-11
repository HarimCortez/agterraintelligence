"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adminBillingSummaryQueryKey,
  adminReportOrdersQueryKey,
  adminSubscriptionsQueryKey,
  fetchAdminBillingSummary,
  fetchAdminReportOrders,
  fetchAdminSubscriptions,
} from "@/lib/admin-billing-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatCurrencyFromCents, formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;

const SUBSCRIPTION_PLANS = ["basic", "investor", "professional"];
const SUBSCRIPTION_STATUSES = ["active", "canceled", "past_due", "incomplete"];
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
 * `/billing` — Billing, Subscriptions & Report Entitlements (REQUIREMENTS.md
 * Section C.2). Scoped to what's real, queryable data today: KPI summary,
 * subscriptions list, report orders list. See `admin-billing.service.ts`'s
 * doc comment for what's deliberately NOT here yet (refunds, promotions,
 * audit log, revenue trend analytics) and why.
 */
export function BillingWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();

  const summaryQuery = useQuery({ queryKey: adminBillingSummaryQueryKey, queryFn: fetchAdminBillingSummary });

  useEffect(() => {
    if (summaryQuery.error) handleUnauthorized(summaryQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.error]);

  if (summaryQuery.isError && summaryQuery.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {summaryQuery.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Billing &amp; Entitlements</h1>
        <p className="text-sm text-text-secondary">Subscriptions, report purchases, and revenue at a glance.</p>
      </header>

      <SummarySection summary={summaryQuery.data} isPending={summaryQuery.isPending} />
      <SubscriptionsTable />
      <ReportOrdersTable />
    </div>
  );
}

function SummarySection({
  summary,
  isPending,
}: {
  summary: import("@/lib/admin-billing-api").AdminBillingSummary | undefined;
  isPending: boolean;
}) {
  const activeSubscriptionsTotal = summary
    ? Object.values(summary.activeSubscriptionsByPlan).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <section className="mb-xl grid grid-cols-1 gap-md sm:grid-cols-4">
      <KpiCard label="Monthly Recurring Revenue" value={isPending ? "…" : formatCurrencyFromCents(summary?.monthlyRecurringRevenueCents ?? 0)} />
      <KpiCard label="Active Subscriptions" value={isPending ? "…" : String(activeSubscriptionsTotal)} />
      <KpiCard
        label="Report Revenue (delivered)"
        value={isPending ? "…" : formatCurrencyFromCents(summary?.totalReportRevenueCents ?? 0)}
      />
      <KpiCard label="Total Report Orders" value={isPending ? "…" : String(summary?.totalReportOrders ?? 0)} />
    </section>
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

function selectClass(): string {
  return "rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary";
}

function SubscriptionsTable() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const params = { plan: plan || undefined, status: status || undefined, limit: PAGE_SIZE, offset };
  const query = useQuery({
    queryKey: adminSubscriptionsQueryKey(params),
    queryFn: () => fetchAdminSubscriptions(params),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  return (
    <section className="mb-xl">
      <div className="mb-md flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Subscriptions</h2>
        <div className="flex gap-sm">
          <select
            className={selectClass()}
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All plans</option>
            {SUBSCRIPTION_PLANS.map((p) => (
              <option key={p} value={p}>
                {formatEnumLabel(p)}
              </option>
            ))}
          </select>
          <select
            className={selectClass()}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatEnumLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">User</th>
              <th className="px-md py-sm">Plan</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Renews / ended</th>
              <th className="px-md py-sm">Stripe customer</th>
              <th className="px-md py-sm">Since</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {query.isSuccess && query.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  No subscriptions match these filters.
                </td>
              </tr>
            )}
            {query.isSuccess &&
              query.data.results.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-md py-sm text-text-primary">{row.userEmail}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{row.plan}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(row.status)}</td>
                  <td className="px-md py-sm text-text-secondary">
                    {row.currentPeriodEnd ? formatDate(row.currentPeriodEnd) : "—"}
                  </td>
                  <td className="px-md py-sm text-text-secondary">{row.stripeCustomerId ?? "—"}</td>
                  <td className="px-md py-sm text-text-secondary">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        offset={offset}
        limit={PAGE_SIZE}
        total={query.data?.total ?? 0}
        onChange={setOffset}
      />
    </section>
  );
}

function ReportOrdersTable() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const params = { status: status || undefined, limit: PAGE_SIZE, offset };
  const query = useQuery({
    queryKey: adminReportOrdersQueryKey(params),
    queryFn: () => fetchAdminReportOrders(params),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  return (
    <section>
      <div className="mb-md flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Report Orders</h2>
        <select
          className={selectClass()}
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
              <th className="px-md py-sm">Price paid</th>
              <th className="px-md py-sm">Basis</th>
              <th className="px-md py-sm">Upgrade credit</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Created</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={8}>
                  Loading…
                </td>
              </tr>
            )}
            {query.isSuccess && query.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={8}>
                  No report orders match these filters.
                </td>
              </tr>
            )}
            {query.isSuccess &&
              query.data.results.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-md py-sm text-text-primary">{row.userEmail}</td>
                  <td className="px-md py-sm text-text-primary">{row.propertyAddress}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{row.reportTierCode}</td>
                  <td className="px-md py-sm text-text-primary">{formatCurrencyFromCents(row.pricePaidCents)}</td>
                  <td className="px-md py-sm text-text-secondary">{formatEnumLabel(row.priceBasis)}</td>
                  <td className="px-md py-sm text-text-secondary">
                    {row.upgradeCreditAppliedCents > 0 ? formatCurrencyFromCents(row.upgradeCreditAppliedCents) : "—"}
                  </td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(row.status)}</td>
                  <td className="px-md py-sm text-text-secondary">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        offset={offset}
        limit={PAGE_SIZE}
        total={query.data?.total ?? 0}
        onChange={setOffset}
      />
    </section>
  );
}

function PaginationControls({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total === 0) return null;
  const start = offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex gap-sm">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={end >= total}
          onClick={() => onChange(offset + limit)}
          className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
