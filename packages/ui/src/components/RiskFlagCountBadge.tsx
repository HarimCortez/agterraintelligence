import { FlagOutlineIcon } from "../icons";

export interface RiskFlagCountBadgeProps {
  /** Number of active risk flags on the property (property list/card context). */
  count: number;
  className?: string;
}

/**
 * Risk indicator for list/card contexts where only a *count* of risk flags
 * is available (GET /v1/properties returns `riskFlagCount: number`, not a
 * severity breakdown — that requires the future property-detail endpoint).
 *
 * DESIGN-SYSTEM.md's Risk Flag Badge spec defines three severity tiers
 * (low/medium/high) with escalating fill weight — that table isn't directly
 * usable here because we don't know severity, only presence-and-count. This
 * component deliberately renders using the *lowest-alarm* tier's visual
 * language (tint fill, outline flag, amber-700 text) rather than guessing at
 * or defaulting to the solid Medium/High treatment — using the more alarming
 * solid styling here would overstate confidence about severity data this
 * endpoint doesn't provide. It still uses the same risk hue family (never
 * the score or confidence hues) and the mandatory paired label, so it reads
 * unambiguously as "risk," just not a claimed severity. This is a judgment
 * call flagged for `ux`/`pm` follow-up if a stronger signal is wanted once
 * the property-detail endpoint exposes real severity.
 */
export function RiskFlagCountBadge({ count, className = "" }: RiskFlagCountBadgeProps) {
  if (count <= 0) return null;

  const label = count === 1 ? "1 risk flag noted" : `${count} risk flags noted`;

  return (
    <span
      className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold bg-risk-low-bg text-risk-low-text ${className}`}
    >
      <FlagOutlineIcon className="h-3 w-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
