import Link from "next/link";
import {
  OpportunityScoreBadge,
  RiskFlagCountBadge,
  DataConfidenceBadge,
} from "@agterra/ui";
import { CompareToggle } from "@/components/CompareToggle";
import { WatchToggle } from "@/components/WatchToggle";
import type { PropertyResult } from "@/lib/properties-api";
import {
  formatCurrencyFromCents,
  formatAcreage,
  formatDiscountPct,
  discountDirection,
  formatLandUseType,
} from "@/lib/formatters";

interface PropertyCardProps {
  property: PropertyResult;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}

export function PropertyCard({ property, selected = false, onHover, onSelect }: PropertyCardProps) {
  const { opportunityScore, valuation } = property;

  return (
    // Plain `div`, not `button` — the address heading below is now a real
    // `next/link` to the Property Intelligence Page, and a `<button>` cannot
    // legally contain another interactive element (the link) per the HTML
    // spec, not just ARIA best-practice. `role="button"` + `tabIndex` +
    // `onKeyDown` restore the keyboard/screen-reader operability a bare div
    // would otherwise lose — a div[role=button] containing a real link is a
    // known, accepted pattern for "clickable card with an internal link"
    // (two genuinely different actions: whole-card select vs. link navigate),
    // unlike button>a which is outright invalid markup.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(property.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(property.id);
        }
      }}
      onMouseEnter={() => onHover?.(property.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`w-full cursor-pointer rounded border bg-surface p-md text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary ${
        selected ? "border-action-primary ring-1 ring-action-primary" : "border-border-subtle"
      } hover:border-border-default`}
    >
      <div className="flex items-start justify-between gap-sm">
        <div>
          <h3 className="text-md font-semibold text-text-primary">
            <Link
              href={`/properties/${property.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
            >
              {property.address}
            </Link>
          </h3>
          <p className="text-sm text-text-secondary">
            {property.county} County, {property.state} · {formatAcreage(property.acreage)} ·{" "}
            {formatLandUseType(property.landUseType)}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-text-primary">
          {formatCurrencyFromCents(property.askingPriceCents)}
        </p>
      </div>

      <div className="mt-sm flex flex-wrap items-center gap-sm">
        {opportunityScore !== null && (
          <span className="text-lg font-semibold tabular-nums text-text-primary">
            {opportunityScore.score}
          </span>
        )}
        <OpportunityScoreBadge band={opportunityScore?.band ?? null} />
        <RiskFlagCountBadge count={property.riskFlagCount} />
      </div>

      <div className="mt-sm flex flex-wrap items-center gap-sm">
        {valuation !== null ? (
          <>
            <span className="text-sm tabular-nums text-text-secondary">
              Est. value {formatCurrencyFromCents(valuation.estimatedValueCents)} (
              {formatDiscountPct(valuation.discountPct)} {discountDirection(valuation.discountPct)})
            </span>
            <DataConfidenceBadge confidence={valuation.confidence} />
          </>
        ) : (
          <span className="text-sm text-text-secondary">Not yet valued</span>
        )}
      </div>

      {/* Distinct third action from whole-card select (map highlight) and
          the address link (navigate to detail) — stops click propagation so
          it doesn't also trigger onSelect. */}
      <div className="mt-sm flex items-center gap-lg border-t border-border-subtle pt-sm">
        <CompareToggle propertyId={property.id} />
        <WatchToggle propertyId={property.id} />
      </div>
    </div>
  );
}
