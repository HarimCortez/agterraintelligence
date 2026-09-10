"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { OpportunityScoreBadge, RiskFlagBadge, DataConfidenceBadge } from "@agterra/ui";
import { useComparisonStore } from "@/lib/comparison-store";
import { fetchPropertyById, propertyQueryKey, type PropertyDetail } from "@/lib/properties-api";
import {
  formatCurrencyFromCents,
  formatAcreage,
  formatDiscountPct,
  discountDirection,
  formatLandUseType,
  formatListingStatus,
  formatRiskType,
} from "@/lib/formatters";

/**
 * `/compare` — Comparison Workspace v1. Client component: the tray's
 * property IDs live in `localStorage` (via the Zustand store), which has no
 * meaningful value on the server (always empty on first server render by
 * definition), so there's no SSR-prefetch pattern to mirror here the way
 * Discover/Property Intelligence Page do.
 *
 * One `GET /v1/properties/:id` per tray entry, parallelized via
 * `useQueries` (not a loop of `useQuery` calls, which can't vary in count
 * across renders per the Rules of Hooks) — the tray is capped at 6, so up to
 * 6 parallel fetches is an accepted, explicitly scoped cost per the task
 * brief, no batching/pagination needed.
 */
export function ComparisonWorkspace() {
  const propertyIds = useComparisonStore((state) => state.propertyIds);
  const remove = useComparisonStore((state) => state.remove);

  const queries = useQueries({
    queries: propertyIds.map((id) => ({
      queryKey: propertyQueryKey(id),
      queryFn: () => fetchPropertyById(id),
    })),
  });

  if (propertyIds.length < 2) {
    return <EmptyState count={propertyIds.length} />;
  }

  const entries = propertyIds.map((id, i) => ({ id, query: queries[i]! }));
  const anyPending = entries.some((e) => e.query.isPending);

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Compare</h1>
        <p className="text-sm text-text-secondary">
          Comparing {propertyIds.length} of up to 6 properties side by side.
        </p>
      </header>

      {anyPending ? <LoadingState /> : <ComparisonTable entries={entries} onRemove={remove} />}
    </div>
  );
}

interface ComparisonEntry {
  id: string;
  query: UseQueryResult<PropertyDetail>;
}

interface ComparisonRow {
  label: string;
  cell: (property: PropertyDetail) => ReactNode;
}

const ROWS: ComparisonRow[] = [
  {
    label: "Address",
    cell: (p) => (
      <Link
        href={`/properties/${p.id}`}
        className="font-semibold text-action-primary hover:underline"
      >
        {p.address}
      </Link>
    ),
  },
  { label: "County", cell: (p) => `${p.county} County, ${p.state}` },
  { label: "Land use", cell: (p) => formatLandUseType(p.landUseType) },
  { label: "Listing status", cell: (p) => formatListingStatus(p.listingStatus) },
  {
    label: "Opportunity Score",
    cell: (p) => (
      <div className="flex flex-wrap items-center gap-xs">
        {p.opportunityScore !== null && (
          <span className="text-lg font-semibold tabular-nums text-text-primary">
            {p.opportunityScore.score}
          </span>
        )}
        <OpportunityScoreBadge band={p.opportunityScore?.band ?? null} />
      </div>
    ),
  },
  { label: "Asking price", cell: (p) => formatCurrencyFromCents(p.askingPriceCents) },
  { label: "Price / acre", cell: (p) => formatCurrencyFromCents(p.pricePerAcreCents) },
  { label: "Acreage", cell: (p) => formatAcreage(p.acreage) },
  {
    label: "Estimated value",
    cell: (p) =>
      p.valuation ? (
        <div className="flex flex-col gap-xs">
          <span className="tabular-nums font-semibold text-text-primary">
            {formatCurrencyFromCents(p.valuation.estimatedValueCents)}
          </span>
          <span className="text-xs tabular-nums text-text-secondary">
            {formatDiscountPct(p.valuation.discountPct)} {discountDirection(p.valuation.discountPct)}{" "}
            estimated value
          </span>
          <DataConfidenceBadge confidence={p.valuation.confidence} />
        </div>
      ) : (
        <span className="text-text-secondary">Not yet valued</span>
      ),
  },
  {
    label: "Risk flags",
    cell: (p) =>
      p.riskFlags.length === 0 ? (
        <span className="text-text-secondary">No risk flags noted</span>
      ) : (
        <ul className="flex flex-col gap-xs">
          {p.riskFlags.map((flag) => (
            <li key={flag.id} className="flex items-center gap-xs">
              <RiskFlagBadge severity={flag.severity} />
              <span className="text-xs text-text-secondary">{formatRiskType(flag.riskType)}</span>
            </li>
          ))}
        </ul>
      ),
  },
];

function ComparisonTable({
  entries,
  onRemove,
}: {
  entries: ComparisonEntry[];
  onRemove: (id: string) => void;
}) {
  // Dynamic column count (2-6) — inline `gridTemplateColumns` rather than a
  // Tailwind utility class, since Tailwind's JIT can't statically extract an
  // arbitrary value built from a runtime template literal.
  const gridTemplateColumns = `160px repeat(${entries.length}, minmax(220px, 1fr))`;

  return (
    <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
      <div className="grid" style={{ gridTemplateColumns }}>
        {/* Header row: sticky-feeling label gutter + per-property remove action. */}
        <div className="border-b border-border-subtle p-sm" />
        {entries.map(({ id, query }) => (
          <div
            key={id}
            className="flex items-start justify-end border-b border-border-subtle p-sm"
          >
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={
                query.data ? `Remove ${query.data.address} from comparison` : "Remove property from comparison"
              }
              title="Remove from comparison"
              className="rounded px-xs text-lg leading-none text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
            >
              ×
            </button>
          </div>
        ))}

        {ROWS.map((row) => (
          <Fragment key={row.label}>
            <div className="border-b border-border-subtle p-sm text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              {row.label}
            </div>
            {entries.map(({ id, query }) => (
              <div key={`${row.label}-${id}`} className="border-b border-border-subtle p-sm text-sm text-text-primary">
                {query.isError ? (
                  <span className="text-text-secondary">Couldn&apos;t load</span>
                ) : query.data ? (
                  row.cell(query.data)
                ) : null}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Compare</h1>
      </header>
      <div className="flex flex-col items-start gap-md rounded border border-border-subtle bg-surface p-xl">
        <p className="text-sm text-text-secondary">
          {count === 0
            ? "Your comparison tray is empty. Add at least 2 properties to compare them side by side."
            : "Add at least 1 more property to compare — the comparison table needs at least 2 properties."}
        </p>
        <Link
          href="/"
          className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
        >
          Browse properties on Discover
        </Link>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-lg" role="status" aria-live="polite">
      <span className="sr-only">Loading comparison…</span>
      <div
        className="h-[480px] animate-pulse rounded border border-border-subtle bg-surface"
        aria-hidden="true"
      />
    </div>
  );
}
