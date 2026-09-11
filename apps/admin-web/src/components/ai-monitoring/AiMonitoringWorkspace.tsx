"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  aiMonitoringCallsQueryKey,
  aiMonitoringSummaryQueryKey,
  aiMonitoringTrendQueryKey,
  fetchAiMonitoringCalls,
  fetchAiMonitoringSummary,
  fetchAiMonitoringTrend,
  type AiCallStatus,
  type AiMonitoringTrendDay,
} from "@/lib/admin-ai-monitoring-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;
const TREND_DAYS = 14;
const STATUSES: AiCallStatus[] = ["succeeded", "failed"];

/**
 * `/ai-monitoring` — AI & Model Monitoring (REQUIREMENTS.md Section
 * 6/9.4/10.2). Everything here reads from `ai_call_logs`, real data for
 * every Anthropic call across both AI features (AI Analyst, report
 * generation) — see `admin-ai-monitoring.service.ts`'s doc comment for
 * what REQUIREMENTS.md's fuller spec asks for that's deliberately NOT
 * here (prediction accuracy, user feedback, uptime, alerting — none of
 * those have real underlying data yet).
 */
export function AiMonitoringWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [status, setStatus] = useState<AiCallStatus | "">("");
  const [feature, setFeature] = useState("");
  const [offset, setOffset] = useState(0);

  const summaryQuery = useQuery({ queryKey: aiMonitoringSummaryQueryKey, queryFn: fetchAiMonitoringSummary });
  const trendQuery = useQuery({
    queryKey: aiMonitoringTrendQueryKey(TREND_DAYS),
    queryFn: () => fetchAiMonitoringTrend(TREND_DAYS),
  });

  const callsParams = { status: status || undefined, feature: feature || undefined, limit: PAGE_SIZE, offset };
  const callsQuery = useQuery({
    queryKey: aiMonitoringCallsQueryKey(callsParams),
    queryFn: () => fetchAiMonitoringCalls(callsParams),
  });

  useEffect(() => {
    if (summaryQuery.error) handleUnauthorized(summaryQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.error]);
  useEffect(() => {
    if (callsQuery.error) handleUnauthorized(callsQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callsQuery.error]);

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
  const featureOptions = summary ? Object.keys(summary.callsByFeature) : [];

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">AI &amp; Model Monitoring</h1>
        <p className="text-sm text-text-secondary">
          Real call volume, success rate, and response time across the AI Analyst and report generation.
        </p>
      </header>

      <section className="mb-lg grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Model status" value={summaryQuery.isPending ? "…" : summary?.modelConfigured ? "Configured" : "Not configured"} />
        <KpiCard label="Total calls" value={summaryQuery.isPending ? "…" : String(summary?.totalCalls ?? 0)} />
        <KpiCard
          label="Success rate"
          value={summaryQuery.isPending ? "…" : summary?.successRatePct == null ? "No calls yet" : `${summary.successRatePct}%`}
        />
        <KpiCard
          label="Avg. response time"
          value={summaryQuery.isPending ? "…" : summary?.averageResponseMs == null ? "No calls yet" : `${summary.averageResponseMs} ms`}
        />
      </section>

      <section className="mb-xl">
        <h2 className="mb-md text-lg font-semibold text-text-primary">Call volume (last {TREND_DAYS} days)</h2>
        {trendQuery.isSuccess && <CallVolumeChart points={trendQuery.data.points} />}
        {trendQuery.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      </section>

      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 className="text-lg font-semibold text-text-primary">Recent calls</h2>
        <div className="flex gap-sm">
          <select
            className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AiCallStatus | "");
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatEnumLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
            value={feature}
            onChange={(e) => {
              setFeature(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All features</option>
            {featureOptions.map((f) => (
              <option key={f} value={f}>
                {formatEnumLabel(f)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">Time</th>
              <th className="px-md py-sm">Feature</th>
              <th className="px-md py-sm">Detail</th>
              <th className="px-md py-sm">Model</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Duration</th>
              <th className="px-md py-sm">Error</th>
            </tr>
          </thead>
          <tbody>
            {callsQuery.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {callsQuery.isSuccess && callsQuery.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={7}>
                  No AI calls match these filters.
                </td>
              </tr>
            )}
            {callsQuery.isSuccess &&
              callsQuery.data.results.map((call) => (
                <tr key={call.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="whitespace-nowrap px-md py-sm text-text-secondary">
                    {new Date(call.createdAt).toLocaleString("en-US")}
                  </td>
                  <td className="px-md py-sm text-text-primary">{formatEnumLabel(call.feature)}</td>
                  <td className="px-md py-sm text-text-secondary">{call.detail}</td>
                  <td className="px-md py-sm text-text-secondary">{call.model}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(call.status)}</td>
                  <td className="px-md py-sm text-text-primary">{call.durationMs} ms</td>
                  <td className="max-w-[280px] truncate px-md py-sm text-xs text-text-secondary" title={call.errorMessage ?? undefined}>
                    {call.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {(callsQuery.data?.total ?? 0) > 0 && (
        <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, callsQuery.data!.total)} of {callsQuery.data!.total}
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
              disabled={offset + PAGE_SIZE >= callsQuery.data!.total}
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

/** Stacked bars: succeeded (brand color) with failed stacked on top (risk-high red) — real volume and real failure rate in one view. */
function CallVolumeChart({ points }: { points: AiMonitoringTrendDay[] }) {
  const width = 900;
  const height = 160;
  const barGap = 2;
  const barWidth = points.length > 0 ? width / points.length - barGap : 0;
  const maxTotal = Math.max(1, ...points.map((p) => p.succeeded + p.failed));
  const allZero = points.every((p) => p.succeeded === 0 && p.failed === 0);

  return (
    <div className="rounded border border-border-subtle bg-surface p-lg">
      {allZero ? (
        <p className="text-sm text-text-secondary">No AI calls in this period yet.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Daily AI call volume">
          {points.map((p, i) => {
            const total = p.succeeded + p.failed;
            const totalHeight = (total / maxTotal) * (height - 20);
            const failedHeight = total > 0 ? (p.failed / total) * totalHeight : 0;
            const succeededHeight = totalHeight - failedHeight;
            const x = i * (barWidth + barGap);
            return (
              <g key={p.date}>
                <rect x={x} y={height - totalHeight} width={barWidth} height={succeededHeight} className="fill-action-primary">
                  <title>
                    {p.date}: {p.succeeded} succeeded, {p.failed} failed
                  </title>
                </rect>
                <rect x={x} y={height - failedHeight} width={barWidth} height={failedHeight} className="fill-risk-high-bg">
                  <title>
                    {p.date}: {p.succeeded} succeeded, {p.failed} failed
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
