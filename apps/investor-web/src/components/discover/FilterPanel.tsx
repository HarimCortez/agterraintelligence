"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  BAND_OPTIONS,
  LAND_USE_OPTIONS,
  SORT_OPTIONS,
  DEFAULT_FILTERS,
  type PropertyFilters,
  type OpportunityBand,
  type LandUseType,
  type SortOption,
} from "@/lib/properties-api";
import { useAuthStore } from "@/lib/auth-store";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";
import { ForbiddenError } from "@/lib/api-errors";
import { createSavedSearch, updateSavedSearch, savedSearchesQueryKey } from "@/lib/saved-searches-api";
import { useQueryClient } from "@tanstack/react-query";

interface FilterPanelProps {
  value: PropertyFilters;
  onApply: (next: PropertyFilters) => void;
  /**
   * Present when this Discover visit came from "Edit filters" on
   * `/saved-searches` (see `SavedSearchesWorkspace`'s `editHref`) — swaps
   * the "Save this search" footer for an "Update saved search" one that
   * PATCHes the existing saved search's criteria instead of creating a new
   * one, closing the previously-missing edit path (saved searches could
   * only be renamed/deleted/recreated before this).
   */
  editSavedSearchId?: string;
  editSavedSearchName?: string;
}

interface DraftState {
  minPriceDollars: string;
  maxPriceDollars: string;
  minAcreage: string;
  maxAcreage: string;
  minScore: string;
  maxScore: string;
  band: OpportunityBand[];
  landUseType: LandUseType[];
  county: string;
}

function filtersToDraft(filters: PropertyFilters): DraftState {
  return {
    minPriceDollars: filters.minPrice !== undefined ? String(filters.minPrice / 100) : "",
    maxPriceDollars: filters.maxPrice !== undefined ? String(filters.maxPrice / 100) : "",
    minAcreage: filters.minAcreage !== undefined ? String(filters.minAcreage) : "",
    maxAcreage: filters.maxAcreage !== undefined ? String(filters.maxAcreage) : "",
    minScore: filters.minScore !== undefined ? String(filters.minScore) : "",
    maxScore: filters.maxScore !== undefined ? String(filters.maxScore) : "",
    band: filters.band ?? [],
    landUseType: filters.landUseType ?? [],
    county: filters.county ?? "",
  };
}

function draftToFilters(draft: DraftState, sort: SortOption): PropertyFilters {
  const toNumber = (s: string): number | undefined => {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  const minPriceDollars = toNumber(draft.minPriceDollars);
  const maxPriceDollars = toNumber(draft.maxPriceDollars);

  return {
    minPrice: minPriceDollars !== undefined ? Math.round(minPriceDollars * 100) : undefined,
    maxPrice: maxPriceDollars !== undefined ? Math.round(maxPriceDollars * 100) : undefined,
    minAcreage: toNumber(draft.minAcreage),
    maxAcreage: toNumber(draft.maxAcreage),
    minScore: toNumber(draft.minScore),
    maxScore: toNumber(draft.maxScore),
    band: draft.band.length > 0 ? draft.band : undefined,
    landUseType: draft.landUseType.length > 0 ? draft.landUseType : undefined,
    county: draft.county.trim() !== "" ? draft.county.trim() : undefined,
    sort,
    limit: DEFAULT_FILTERS.limit,
    offset: 0,
  };
}

const labelClass = "text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary";
const inputClass =
  "w-full rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-action-primary";
const checkboxRowClass = "flex items-center gap-xs text-sm text-text-primary";

/**
 * Filter panel — every field except Sort is gated behind an explicit "Apply
 * Filters" button rather than debounced. Decision: the numeric range inputs
 * (price/acreage/score) would fire an API request on every keystroke under
 * a debounce approach, which is jarring for a two-sided min/max entry (the
 * user is usually mid-typing both fields before either is a valid filter).
 * An explicit Apply also matches the "institutional terminal" posture
 * (deliberate, controlled queries) better than live-filtering. Sort is the
 * one exception — it's a single discrete selection, not a value a user is
 * mid-composing, so it applies immediately on change.
 */
export function FilterPanel({ value, onApply, editSavedSearchId, editSavedSearchName }: FilterPanelProps) {
  const [draft, setDraft] = useState<DraftState>(() => filtersToDraft(value));
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const handleUnauthorized = useHandleUnauthorized();

  const saveSearchMutation = useMutation({
    mutationFn: () => createSavedSearch(savedSearchName.trim(), value),
    onSuccess: () => {
      setIsSavingSearch(false);
      setSavedSearchName("");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    },
    onError: (error) => handleUnauthorized(error),
  });

  const updateSearchMutation = useMutation({
    mutationFn: (criteria: PropertyFilters) => updateSavedSearch(editSavedSearchId!, { criteria }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedSearchesQueryKey });
      router.push("/saved-searches");
    },
    onError: (error) => handleUnauthorized(error),
  });

  // "Update saved search" applies the current draft itself rather than
  // requiring a separate "Apply Filters" click first — the footer copy
  // ("Adjust filters above, then update") promises a two-step flow, so the
  // PATCH must use freshly-computed filters from `draft`, not the possibly-
  // stale applied `value` (a bug caught in code review: clicking Update
  // without an intervening Apply previously PATCHed the *old* criteria,
  // silently discarding the user's edit).
  const handleUpdateSearch = () => {
    const next = draftToFilters(draft, value.sort ?? "score_desc");
    onApply(next);
    updateSearchMutation.mutate(next);
  };

  const handleSaveSearchClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsSavingSearch(true);
  };

  const update = <K extends keyof DraftState>(key: K, val: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: val }));

  const toggleBand = (band: OpportunityBand) =>
    setDraft((d) => ({
      ...d,
      band: d.band.includes(band) ? d.band.filter((b) => b !== band) : [...d.band, band],
    }));

  const toggleLandUse = (lu: LandUseType) =>
    setDraft((d) => ({
      ...d,
      landUseType: d.landUseType.includes(lu)
        ? d.landUseType.filter((l) => l !== lu)
        : [...d.landUseType, lu],
    }));

  const handleApply = () => {
    onApply(draftToFilters(draft, value.sort ?? "score_desc"));
  };

  const handleReset = () => {
    setDraft(filtersToDraft(DEFAULT_FILTERS));
    onApply(DEFAULT_FILTERS);
  };

  const handleSortChange = (sort: SortOption) => {
    onApply({ ...draftToFilters(draft, sort) });
  };

  return (
    <aside className="w-full max-w-[280px] shrink-0 rounded border border-filter-panel-border bg-filter-panel-bg p-xl">
      <h2 className="mb-lg text-lg font-semibold text-text-primary">Filters</h2>

      <div className="mb-lg">
        <label className={labelClass}>Sort</label>
        <select
          className={`${inputClass} mt-xs`}
          value={value.sort ?? "score_desc"}
          onChange={(e) => handleSortChange(e.target.value as SortOption)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-lg">
        <span className={labelClass}>Asking price ($)</span>
        <div className="mt-xs flex items-center gap-sm">
          <input
            type="number"
            min={0}
            placeholder="Min"
            className={inputClass}
            value={draft.minPriceDollars}
            onChange={(e) => update("minPriceDollars", e.target.value)}
            aria-label="Minimum asking price in dollars"
          />
          <span className="text-text-secondary">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            className={inputClass}
            value={draft.maxPriceDollars}
            onChange={(e) => update("maxPriceDollars", e.target.value)}
            aria-label="Maximum asking price in dollars"
          />
        </div>
      </div>

      <div className="mb-lg">
        <span className={labelClass}>Acreage</span>
        <div className="mt-xs flex items-center gap-sm">
          <input
            type="number"
            min={0}
            placeholder="Min"
            className={inputClass}
            value={draft.minAcreage}
            onChange={(e) => update("minAcreage", e.target.value)}
            aria-label="Minimum acreage"
          />
          <span className="text-text-secondary">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            className={inputClass}
            value={draft.maxAcreage}
            onChange={(e) => update("maxAcreage", e.target.value)}
            aria-label="Maximum acreage"
          />
        </div>
      </div>

      <div className="mb-lg">
        <span className={labelClass}>Opportunity score</span>
        <div className="mt-xs flex items-center gap-sm">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Min"
            className={inputClass}
            value={draft.minScore}
            onChange={(e) => update("minScore", e.target.value)}
            aria-label="Minimum opportunity score"
          />
          <span className="text-text-secondary">–</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Max"
            className={inputClass}
            value={draft.maxScore}
            onChange={(e) => update("maxScore", e.target.value)}
            aria-label="Maximum opportunity score"
          />
        </div>
      </div>

      <fieldset className="mb-lg">
        <legend className={labelClass}>Opportunity band</legend>
        <div className="mt-xs flex flex-col gap-xs">
          {BAND_OPTIONS.map((opt) => (
            <label key={opt.value} className={checkboxRowClass}>
              <input
                type="checkbox"
                checked={draft.band.includes(opt.value)}
                onChange={() => toggleBand(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-lg">
        <legend className={labelClass}>Land use type</legend>
        <div className="mt-xs flex flex-col gap-xs">
          {LAND_USE_OPTIONS.map((opt) => (
            <label key={opt.value} className={checkboxRowClass}>
              <input
                type="checkbox"
                checked={draft.landUseType.includes(opt.value)}
                onChange={() => toggleLandUse(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-xl">
        <label className={labelClass} htmlFor="county-input">
          County
        </label>
        <input
          id="county-input"
          type="text"
          placeholder="e.g. Okeechobee"
          className={`${inputClass} mt-xs`}
          value={draft.county}
          onChange={(e) => update("county", e.target.value)}
        />
      </div>

      <div className="flex gap-sm">
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-action-primary"
        >
          Apply Filters
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-border-default px-md py-sm text-sm font-semibold text-text-secondary hover:bg-workspace-bg focus:outline-none focus:ring-2 focus:ring-action-primary"
        >
          Reset
        </button>
      </div>

      {/* Saves the *currently applied* filters (`value`), not the unapplied
          `draft` — a logged-out click redirects straight to `/login` (same
          "graceful, not broken" pattern as `WatchToggle`) rather than
          firing a request that would 401. */}
      <div className="mt-lg border-t border-border-subtle pt-lg">
        {editSavedSearchId ? (
          <div className="flex flex-col gap-sm">
            <p className="text-sm text-text-secondary">
              Editing{" "}
              <span className="font-semibold text-text-primary">{editSavedSearchName ?? "this search"}</span>. Adjust
              filters above, then update.
            </p>
            {updateSearchMutation.isError && (
              <p role="alert" className="text-xs text-text-secondary">
                {updateSearchMutation.error instanceof Error
                  ? updateSearchMutation.error.message
                  : "Couldn't update this saved search. Please try again."}
              </p>
            )}
            <div className="flex gap-sm">
              <button
                type="button"
                onClick={handleUpdateSearch}
                disabled={updateSearchMutation.isPending}
                className="flex-1 rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updateSearchMutation.isPending ? "Updating…" : "Update saved search"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/saved-searches")}
                className="rounded border border-border-default px-md py-sm text-sm font-semibold text-text-secondary hover:bg-workspace-bg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isSavingSearch ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (savedSearchName.trim() !== "") saveSearchMutation.mutate();
            }}
            className="flex flex-col gap-sm"
          >
            <label className={labelClass} htmlFor="saved-search-name">
              Search name
            </label>
            <input
              id="saved-search-name"
              type="text"
              placeholder="e.g. Okeechobee exceptional deals"
              maxLength={100}
              autoFocus
              className={inputClass}
              value={savedSearchName}
              onChange={(e) => setSavedSearchName(e.target.value)}
            />
            {saveSearchMutation.isError && saveSearchMutation.error instanceof ForbiddenError && (
              <p role="alert" className="text-xs text-text-secondary">
                {saveSearchMutation.error.message}
              </p>
            )}
            <div className="flex gap-sm">
              <button
                type="submit"
                disabled={saveSearchMutation.isPending || savedSearchName.trim() === ""}
                className="flex-1 rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveSearchMutation.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSavingSearch(false);
                  setSavedSearchName("");
                }}
                className="rounded border border-border-default px-md py-sm text-sm font-semibold text-text-secondary hover:bg-workspace-bg"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleSaveSearchClick}
            title={user ? undefined : "Log in to save searches"}
            className="w-full rounded border border-action-primary px-md py-sm text-sm font-semibold text-action-primary hover:bg-filter-chip-active-bg focus:outline-none focus:ring-2 focus:ring-action-primary"
          >
            {justSaved ? "Saved!" : "Save this search"}
          </button>
        )}
      </div>
    </aside>
  );
}
