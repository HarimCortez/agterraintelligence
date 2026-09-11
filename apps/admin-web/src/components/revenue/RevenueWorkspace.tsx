"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adminRevenueSummaryQueryKey,
  adminRevenueTrendQueryKey,
  adminTopTransactionsQueryKey,
  fetchAdminRevenueSummary,
  fetchAdminRevenueTrend,
  fetchAdminTopTransactions,
} from "@/lib/admin-revenue-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatCurrencyFromCents, formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const TREND_DAYS = 30;

/**
 * `/revenue` — Revenue Analytics (REQUIREMENTS.md Section C.8): revenue by
 * report tier, revenue by persona, a daily trend, and high-value
 * transactions. See `admin-revenue.service.ts`'s doc comment for what's
 * deliberately not here (cohort retention, geography) and why — both
 * would need real data this product doesn't have yet, not just more UI.
 */
export function RevenueWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();

  const summaryQuery = useQuery({ queryKey: adminRevenueSummaryQueryKey, queryFn: fetchAdminRevenueSummary });
  const trendQuery = useQuery({
    queryKey: adminRevenueTrendQueryKey(TREND_DAYS),
    queryFn: () => fetchAdminRevenueTrend(TREND_DAYS),
  });
  const topTransactionsQuery = useQuery({
    queryKey: adminTopTransactionsQueryKey,
    queryFn: fetchAdminTopTransactions,
  });

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

  const summary = summaryQuery.data;

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Revenue Analytics</h1>
        <p className="text-sm text-text-secondary">Revenue by tier, by persona, over time, and top transactions.</p>
      </header>

      <section className="mb-xl grid grid-cols-1 gap-md sm:grid-cols-3">
        <KpiCard
          label="Monthly Recurring Revenue"
          value={summaryQuery.isPending ? "…" : formatCurrencyFromCents(summary?.subscriptionMrrCents ?? 0)}
        />
        <KpiCard
          label="Report Revenue (delivered)"
          value={summaryQuery.isPending ? "…" : formatCurrencyFromCents(summary?.reportRevenueCents ?? 0)}
        />
        <KpiCard
          label="Total"
          value={
            summaryQuery.isPending
              ? "…"
              : formatCurrencyFromCents((summary?.subscriptionMrrCents ?? 0) + (summary?.reportRevenueCents ?? 0))
          }
        />
      </section>

      <section className="mb-xl">
        <h2 className="mb-md text-lg font-semibold text-text-primary">
          Report revenue — last {TREND_DAYS} days
        </h2>
        {trendQuery.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
        {trendQuery.isSuccess && <RevenueTrendChart points={trendQuery.data} />}
      </section>

      <section className="mb-xl grid grid-cols-1 gap-lg lg:grid-cols-2">
        <div>
          <h2 className="mb-md text-lg font-semibold text-text-primary">Revenue by report tier</h2>
          <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                  <th className="px-md py-sm">Tier</th>
                  <th className="px-md py-sm">Orders</th>
                  <th className="px-md py-sm">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summaryQuery.isPending && (
                  <tr>
                    <td className="px-md py-md text-text-secondary" colSpan={3}>
                      Loading…
                    </td>
                  </tr>
                )}
                {summaryQuery.isSuccess && summary!.revenueByTier.length === 0 && (
                  <tr>
                    <td className="px-md py-md text-text-secondary" colSpan={3}>
                      No delivered report orders yet.
                    </td>
                  </tr>
                )}
                {summaryQuery.isSuccess &&
                  summary!.revenueByTier.map((row) => (
                    <tr key={row.reportTierCode} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-md py-sm text-text-primary">{row.displayName}</td>
                      <td className="px-md py-sm text-text-secondary">{row.orderCount}</td>
                      <td className="px-md py-sm text-text-primary">{formatCurrencyFromCents(row.revenueCents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-md text-lg font-semibold text-text-primary">Revenue by persona</h2>
          <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                  <th className="px-md py-sm">Persona</th>
                  <th className="px-md py-sm">Active subs</th>
                  <th className="px-md py-sm">Report revenue</th>
                </tr>
              </thead>
              <tbody>
                {summaryQuery.isPending && (
                  <tr>
                    <td className="px-md py-md text-text-secondary" colSpan={3}>
                      Loading…
                    </td>
                  </tr>
                )}
                {summaryQuery.isSuccess &&
                  summary!.revenueByPersona
                    .filter((row) => row.activeSubscriptionCount > 0 || row.reportOrderCount > 0)
                    .map((row) => (
                      <tr key={row.externalRole} className="border-b border-border-subtle last:border-b-0">
                        <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(row.externalRole)}</td>
                        <td className="px-md py-sm text-text-secondary">{row.activeSubscriptionCount}</td>
                        <td className="px-md py-sm text-text-primary">{formatCurrencyFromCents(row.reportRevenueCents)}</td>
                      </tr>
                    ))}
                {summaryQuery.isSuccess &&
                  summary!.revenueByPersona.every((row) => row.activeSubscriptionCount === 0 && row.reportOrderCount === 0) && (
                    <tr>
                      <td className="px-md py-md text-text-secondary" colSpan={3}>
                        No revenue recorded yet.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-md text-lg font-semibold text-text-primary">Top transactions</h2>
        <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                <th className="px-md py-sm">User</th>
                <th className="px-md py-sm">Property</th>
                <th className="px-md py-sm">Tier</th>
                <th className="px-md py-sm">Amount</th>
                <th className="px-md py-sm">Date</th>
              </tr>
            </thead>
            <tbody>
              {topTransactionsQuery.isPending && (
                <tr>
                  <td className="px-md py-md text-text-secondary" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              )}
              {topTransactionsQuery.isSuccess && topTransactionsQuery.data.length === 0 && (
                <tr>
                  <td className="px-md py-md text-text-secondary" colSpan={5}>
                    No delivered report orders yet.
                  </td>
                </tr>
              )}
              {topTransactionsQuery.isSuccess &&
                topTransactionsQuery.data.map((row) => (
                  <tr key={row.orderId} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-md py-sm text-text-primary">{row.userEmail}</td>
                    <td className="px-md py-sm text-text-primary">{row.propertyAddress}</td>
                    <td className="px-md py-sm capitalize text-text-primary">{row.reportTierCode}</td>
                    <td className="px-md py-sm text-text-primary">{formatCurrencyFromCents(row.pricePaidCents)}</td>
                    <td className="px-md py-sm text-text-secondary">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
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

/**
 * Hand-rolled SVG bar chart — no charting library dependency for one
 * simple daily-revenue bar chart. Revisit if/when more charts are needed
 * across the admin console and a shared library becomes worth the weight.
 */
function RevenueTrendChart({ points }: { points: { date: string; reportRevenueCents: number }[] }) {
  const width = 900;
  const height = 160;
  const barGap = 2;
  const barWidth = points.length > 0 ? width / points.length - barGap : 0;
  const maxCents = Math.max(1, ...points.map((p) => p.reportRevenueCents));

  const allZero = points.every((p) => p.reportRevenueCents === 0);

  return (
    <div className="rounded border border-border-subtle bg-surface p-lg">
      {allZero ? (
        <p className="text-sm text-text-secondary">No report revenue in this period yet.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Daily report revenue">
          {points.map((p, i) => {
            const barHeight = (p.reportRevenueCents / maxCents) * (height - 20);
            return (
              <g key={p.date}>
                <rect
                  x={i * (barWidth + barGap)}
                  y={height - barHeight}
                  width={barWidth}
                  height={barHeight}
                  className="fill-action-primary"
                >
                  <title>
                    {p.date}: {formatCurrencyFromCents(p.reportRevenueCents)}
                  </title>
                </rect>
              </g>
            );
          })}
        </svg>
      )}
      <div className="mt-xs flex justify-between text-xs text-text-secondary">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}
