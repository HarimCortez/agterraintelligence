"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchProperties, propertiesQueryKey, type PropertyFilters } from "@/lib/properties-api";
import { FilterPanel } from "./FilterPanel";
import { PropertyList } from "./PropertyList";

// Mapbox GL JS touches `window` at module-import time, so it must never be
// evaluated during SSR — `ssr: false` guarantees the module only loads in
// the browser, even though DiscoverWorkspace itself (a "use client"
// component) is still rendered once on the server for the initial HTML.
const PropertyMap = dynamic(() => import("./PropertyMap").then((m) => m.PropertyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[500px] w-full items-center justify-center rounded border border-border-subtle bg-surface text-sm text-text-secondary">
      Loading map…
    </div>
  ),
});

interface DiscoverWorkspaceProps {
  initialFilters: PropertyFilters;
}

export function DiscoverWorkspace({ initialFilters }: DiscoverWorkspaceProps) {
  const [filters, setFilters] = useState<PropertyFilters>(initialFilters);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: propertiesQueryKey(filters),
    queryFn: () => fetchProperties(filters),
    placeholderData: keepPreviousData,
  });

  const results = query.data?.results ?? [];

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Discover</h1>
        <p className="text-sm text-text-secondary">
          Browse and filter agricultural land opportunities across Florida.
        </p>
      </header>

      <div className="flex gap-xl">
        <FilterPanel value={filters} onApply={setFilters} />

        <div className="grid flex-1 grid-cols-1 gap-lg xl:grid-cols-2">
          <section aria-label="Property results list" className="min-h-[500px]">
            {query.isPending && <LoadingState />}
            {query.isError && (
              <ErrorState
                message={query.error instanceof Error ? query.error.message : "Something went wrong."}
                onRetry={() => query.refetch()}
              />
            )}
            {query.isSuccess && (
              <PropertyList
                properties={results}
                total={query.data.total}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
              />
            )}
          </section>

          <section aria-label="Property map" className="min-h-[500px]">
            <PropertyMap
              properties={results}
              hoveredId={hoveredId}
              selectedId={selectedId}
              onHover={setHoveredId}
              onSelect={setSelectedId}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-lg" role="status" aria-live="polite">
      <span className="sr-only">Loading properties…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[132px] animate-pulse rounded border border-border-subtle bg-surface"
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
      <p className="font-semibold">Couldn&apos;t load properties</p>
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
