"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  dataQualityPropertiesQueryKey,
  dataQualitySummaryQueryKey,
  fetchDataQualityProperties,
  fetchDataQualitySummary,
  type DataQualityIssue,
  type ValuationConfidence,
} from "@/lib/admin-data-quality-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;
const CONFIDENCE_LEVELS: ValuationConfidence[] = ["verified", "modeled", "ai_inferred", "unknown"];
const ISSUES: { value: DataQualityIssue; label: string }[] = [
  { value: "missing_valuation", label: "Missing valuation" },
  { value: "missing_score", label: "Missing opportunity score" },
  { value: "possible_duplicate", label: "Possible duplicate" },
  { value: "has_risk_flags", label: "Has risk flags" },
];

/**
 * `/data-quality` — Content & Data Quality (REQUIREMENTS.md Section 6/10.2).
 * `confidence` is `data`'s existing `ValuationConfidence` field; `issues`
 * are computed server-side from real joins (missing valuation/score,
 * duplicate address text, risk flag presence) — nothing here is
 * fabricated or pre-computed/stored separately from the data itself.
 */
export function DataQualityWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [confidence, setConfidence] = useState<ValuationConfidence | "">("");
  const [issue, setIssue] = useState<DataQualityIssue | "">("");
  const [offset, setOffset] = useState(0);

  const summaryQuery = useQuery({ queryKey: dataQualitySummaryQueryKey, queryFn: fetchDataQualitySummary });

  const params = { confidence: confidence || undefined, issue: issue || undefined, limit: PAGE_SIZE, offset };
  const propertiesQuery = useQuery({
    queryKey: dataQualityPropertiesQueryKey(params),
    queryFn: () => fetchDataQualityProperties(params),
  });

  useEffect(() => {
    if (summaryQuery.error) handleUnauthorized(summaryQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.error]);
  useEffect(() => {
    if (propertiesQuery.error) handleUnauthorized(propertiesQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertiesQuery.error]);

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
        <h1 className="text-2xl font-semibold text-text-primary">Content &amp; Data Quality</h1>
        <p className="text-sm text-text-secondary">Valuation confidence, missing data, and possible duplicates.</p>
      </header>

      <section className="mb-xl grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Verified"
          value={summaryQuery.isPending ? "…" : String(summary?.countByConfidence.verified ?? 0)}
        />
        <KpiCard
          label="Missing valuation"
          value={summaryQuery.isPending ? "…" : String(summary?.propertiesMissingValuation ?? 0)}
        />
        <KpiCard
          label="Missing opportunity score"
          value={summaryQuery.isPending ? "…" : String(summary?.propertiesMissingScore ?? 0)}
        />
        <KpiCard
          label="Possible duplicates"
          value={summaryQuery.isPending ? "…" : String(summary?.possibleDuplicateProperties ?? 0)}
        />
      </section>

      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 className="text-lg font-semibold text-text-primary">Properties</h2>
        <div className="flex gap-sm">
          <select
            className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
            value={confidence}
            onChange={(e) => {
              setConfidence(e.target.value as ValuationConfidence | "");
              setOffset(0);
            }}
          >
            <option value="">All confidence levels</option>
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {formatEnumLabel(c)}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
            value={issue}
            onChange={(e) => {
              setIssue(e.target.value as DataQualityIssue | "");
              setOffset(0);
            }}
          >
            <option value="">All issues</option>
            {ISSUES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">Address</th>
              <th className="px-md py-sm">County</th>
              <th className="px-md py-sm">Confidence</th>
              <th className="px-md py-sm">Risk flags</th>
              <th className="px-md py-sm">Issues</th>
              <th className="px-md py-sm">Updated</th>
            </tr>
          </thead>
          <tbody>
            {propertiesQuery.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {propertiesQuery.isSuccess && propertiesQuery.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  No properties match these filters.
                </td>
              </tr>
            )}
            {propertiesQuery.isSuccess &&
              propertiesQuery.data.results.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-md py-sm text-text-primary">
                    <Link href={`/data-quality/${row.id}`} className="text-action-primary underline">
                      {row.address}
                    </Link>
                  </td>
                  <td className="px-md py-sm text-text-secondary">{row.county}</td>
                  <td className="px-md py-sm capitalize text-text-primary">
                    {row.confidence ? formatEnumLabel(row.confidence) : "—"}
                  </td>
                  <td className="px-md py-sm text-text-primary">{row.riskFlagCount}</td>
                  <td className="px-md py-sm text-xs text-text-secondary">
                    {row.issues.length === 0 ? "—" : row.issues.map((i) => formatEnumLabel(i)).join(", ")}
                  </td>
                  <td className="px-md py-sm text-text-secondary">{formatDate(row.updatedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {(propertiesQuery.data?.total ?? 0) > 0 && (
        <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, propertiesQuery.data!.total)} of {propertiesQuery.data!.total}
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
              disabled={offset + PAGE_SIZE >= propertiesQuery.data!.total}
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
