"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { OpportunityScoreBadge, RiskFlagBadge, DataConfidenceBadge } from "@agterra/ui";
import { CompareToggle } from "@/components/CompareToggle";
import { WatchToggle } from "@/components/WatchToggle";
import { AiAnalystPanel } from "@/components/property-detail/AiAnalystPanel";
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

// Mapbox GL JS touches `window` at module-import time — same `ssr: false`
// rationale as the Discover map (see DiscoverWorkspace.tsx).
const PropertyDetailMap = dynamic(
  () => import("./PropertyDetailMap").then((m) => m.PropertyDetailMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full items-center justify-center rounded border border-border-subtle bg-surface text-sm text-text-secondary">
        Loading map…
      </div>
    ),
  },
);

interface PropertyDetailViewProps {
  id: string;
}

/**
 * Property Intelligence Page v1 — client component consuming the
 * server-hydrated `GET /v1/properties/:id` query (see `app/properties/[id]/page.tsx`
 * for the SSR-prefetch + `HydrationBoundary` setup, same pattern as Discover).
 *
 * Scope note: this pass deliberately omits investment thesis, comparables,
 * report-tier purchase, watch/share actions, and score-breakdown detail —
 * none of those have backing data/features yet (see task brief). Compare is
 * now implemented (see `CompareToggle`).
 */
export function PropertyDetailView({ id }: PropertyDetailViewProps) {
  const query = useQuery({
    queryKey: propertyQueryKey(id),
    queryFn: () => fetchPropertyById(id),
  });

  return (
    <div className="p-xl">
      <Link
        href="/"
        className="mb-lg inline-flex w-fit items-center gap-xs text-sm font-semibold text-action-primary hover:underline"
      >
        ← Back to Discover
      </Link>

      {query.isPending && <LoadingState />}
      {query.isError && (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Something went wrong."}
          onRetry={() => query.refetch()}
        />
      )}
      {query.isSuccess && <PropertyDetailContent id={id} property={query.data} />}
    </div>
  );
}

function PropertyDetailContent({ id, property }: { id: string; property: PropertyDetail }) {
  const hasElevatedRisk = property.riskFlags.some(
    (flag) => flag.severity === "medium" || flag.severity === "high",
  );

  return (
    <div className="flex flex-col gap-xl">
      <header className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{property.address}</h1>
          <p className="mt-xs text-sm text-text-secondary">
            {property.county} County, {property.state} · {formatLandUseType(property.landUseType)} ·{" "}
            {formatListingStatus(property.listingStatus)}
          </p>
        </div>
        <div className="flex items-center gap-lg">
          <CompareToggle propertyId={id} />
          <WatchToggle propertyId={id} />
        </div>
      </header>

      {/* Opportunity Score hero — the one number in the product that gets the
          editorial serif `display` treatment, per DESIGN-SYSTEM.md. Always
          paired with the band badge (icon + label), never color/size alone. */}
      <section
        aria-label="Opportunity score"
        className="rounded border border-border-subtle bg-surface p-lg"
      >
        {property.opportunityScore ? (
          <div className="flex flex-wrap items-end gap-lg">
            <span className="font-serif text-display tabular-nums text-text-primary">
              {property.opportunityScore.score}
            </span>
            <div className="flex flex-col gap-xs pb-xs">
              <span className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                Opportunity Score
              </span>
              <OpportunityScoreBadge band={property.opportunityScore.band} variant="full" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-sm">
            <span className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              Opportunity Score
            </span>
            <OpportunityScoreBadge band={null} />
          </div>
        )}
      </section>

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-lg sm:grid-cols-3">
        <MetricCard label="Asking price" value={formatCurrencyFromCents(property.askingPriceCents)} />
        <MetricCard label="Price / acre" value={formatCurrencyFromCents(property.pricePerAcreCents)} />
        <MetricCard label="Acreage" value={formatAcreage(property.acreage)} />
      </section>

      <section aria-label="Valuation" className="rounded border border-border-subtle bg-surface p-lg">
        <h2 className="mb-sm text-lg font-semibold text-text-primary">Valuation</h2>
        {property.valuation ? (
          <div className="flex flex-wrap items-center gap-md">
            <p className="text-2xl font-semibold tabular-nums text-text-primary">
              {formatCurrencyFromCents(property.valuation.estimatedValueCents)}
            </p>
            <p className="text-sm tabular-nums text-text-secondary">
              {formatDiscountPct(property.valuation.discountPct)}{" "}
              {discountDirection(property.valuation.discountPct)} estimated value
            </p>
            <DataConfidenceBadge confidence={property.valuation.confidence} />
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Not yet valued.</p>
        )}
      </section>

      <section aria-label="Risk flags" className="rounded border border-border-subtle bg-surface p-lg">
        <h2 className="mb-sm text-lg font-semibold text-text-primary">Risk Flags</h2>
        {property.riskFlags.length === 0 ? (
          <p className="text-sm text-text-secondary">No risk flags noted.</p>
        ) : (
          <ul className="flex flex-col gap-md">
            {property.riskFlags.map((flag) => (
              <li
                key={flag.id}
                className="flex flex-col gap-xs border-b border-border-subtle pb-md last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-sm">
                  <RiskFlagBadge severity={flag.severity} />
                  <span className="text-sm font-semibold text-text-primary">
                    {formatRiskType(flag.riskType)}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">{flag.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AiAnalystPanel propertyId={id} />

      <section aria-label="Property location">
        <h2 className="mb-sm text-lg font-semibold text-text-primary">Location</h2>
        <div className="h-[360px]">
          <PropertyDetailMap
            lat={property.lat}
            lng={property.lng}
            band={property.opportunityScore?.band ?? null}
            hasRisk={hasElevatedRisk}
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border-subtle bg-surface p-md">
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
        {label}
      </p>
      <p className="mt-xs text-3xl font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-lg" role="status" aria-live="polite">
      <span className="sr-only">Loading property…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[100px] animate-pulse rounded border border-border-subtle bg-surface"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
    >
      <p className="font-semibold">Couldn&apos;t load this property</p>
      <p className="text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
