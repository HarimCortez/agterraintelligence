"use client";

import { useComparisonStore, COMPARISON_TRAY_LIMIT } from "@/lib/comparison-store";

interface CompareToggleProps {
  propertyId: string;
  className?: string;
}

/**
 * Compare checkbox — adds/removes a single property from the global
 * comparison tray. Deliberately a distinct action from `PropertyCard`'s
 * whole-card click (map highlight/select) and the address link (navigate to
 * detail): callers must `stopPropagation` on the wrapping `<label>` so a
 * click here doesn't also trigger the card's `onSelect`.
 *
 * Disabled (with an explanatory `title`) once the tray is at the 6-property
 * cap and this property isn't already in it — the store's `add` silently
 * no-ops past the cap, so the UI needs to make that limit visible rather
 * than let a click appear to do nothing.
 */
export function CompareToggle({ propertyId, className = "" }: CompareToggleProps) {
  const propertyIds = useComparisonStore((state) => state.propertyIds);
  const add = useComparisonStore((state) => state.add);
  const remove = useComparisonStore((state) => state.remove);

  const inTray = propertyIds.includes(propertyId);
  const isFull = !inTray && propertyIds.length >= COMPARISON_TRAY_LIMIT;

  return (
    <label
      onClick={(e) => e.stopPropagation()}
      title={
        isFull
          ? `Comparison tray is full (max ${COMPARISON_TRAY_LIMIT} properties) — remove one to add another`
          : undefined
      }
      className={`inline-flex items-center gap-xs text-sm ${
        isFull ? "cursor-not-allowed text-text-secondary opacity-60" : "cursor-pointer text-text-primary"
      } ${className}`}
    >
      <input
        type="checkbox"
        checked={inTray}
        disabled={isFull}
        onChange={() => (inTray ? remove(propertyId) : add(propertyId))}
        className="h-4 w-4 rounded border-border-default accent-action-primary disabled:cursor-not-allowed"
      />
      <span>{inTray ? "In comparison" : "Compare"}</span>
    </label>
  );
}
