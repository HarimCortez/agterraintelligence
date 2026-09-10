import type { ReactNode } from "react";
import {
  StarFilledIcon,
  ChevronUpFilledIcon,
  ChevronUpOutlineIcon,
  EyeIcon,
  MinusIcon,
} from "../icons";

export type OpportunityBand =
  | "exceptional"
  | "strong"
  | "promising"
  | "watch"
  | "limited";

export interface OpportunityScoreBadgeProps {
  /** null when the property has no opportunity score yet. */
  band: OpportunityBand | null;
  /**
   * "compact" (default) is the table/card/map-popover treatment. "full"
   * spells out "Limited Opportunity" instead of "Limited" — per
   * DESIGN-SYSTEM.md's Opportunity Score badge table. Neither variant is
   * the serif hero display (Property Intelligence Page only, out of scope
   * for this screen).
   */
  variant?: "compact" | "full";
  className?: string;
}

const BAND_CONFIG: Record<
  OpportunityBand,
  {
    label: string;
    fullLabel: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: (className: string) => ReactNode;
  }
> = {
  exceptional: {
    label: "Exceptional",
    fullLabel: "Exceptional",
    bgClass: "bg-score-exceptional-bg",
    textClass: "text-score-exceptional-text",
    borderClass: "border-l-[3px] border-l-gold-accent",
    icon: (className) => (
      <StarFilledIcon className={`${className} text-score-exceptional-accent`} />
    ),
  },
  strong: {
    label: "Strong",
    fullLabel: "Strong",
    bgClass: "bg-score-strong-bg",
    textClass: "text-score-strong-text",
    borderClass: "",
    icon: (className) => <ChevronUpFilledIcon className={className} />,
  },
  promising: {
    label: "Promising",
    fullLabel: "Promising",
    bgClass: "bg-score-promising-bg",
    textClass: "text-score-promising-text",
    borderClass: "border border-score-promising-border",
    icon: (className) => <ChevronUpOutlineIcon className={className} />,
  },
  watch: {
    label: "Watch",
    fullLabel: "Watch",
    bgClass: "bg-score-watch-bg",
    textClass: "text-score-watch-text",
    borderClass: "",
    icon: (className) => <EyeIcon className={className} />,
  },
  limited: {
    label: "Limited",
    fullLabel: "Limited Opportunity",
    bgClass: "bg-score-limited-bg",
    textClass: "text-score-limited-text",
    borderClass: "border border-score-limited-border",
    icon: (className) => <MinusIcon className={className} />,
  },
};

/**
 * Opportunity Score band badge — icon + always-visible label, never color
 * alone (DESIGN-SYSTEM.md, "Opportunity Score Badge — 5 Bands"). Renders a
 * neutral "Not yet scored" pill when `band` is null (property has no score
 * yet) — this null-state treatment isn't in the DESIGN-SYSTEM spec's band
 * table (which only covers the 5 scored bands), so it's a judgment call
 * made here: solid `border-default` outline (not the dashed grammar, which
 * DESIGN-SYSTEM.md reserves exclusively for Data Confidence) so "no score"
 * reads as a distinct, unclaimed state rather than either a low score or an
 * uncertain one.
 */
export function OpportunityScoreBadge({
  band,
  variant = "compact",
  className = "",
}: OpportunityScoreBadgeProps) {
  if (band === null) {
    return (
      <span
        className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold uppercase tracking-[var(--tracking-label)] bg-surface text-text-secondary border border-border-default ${className}`}
      >
        Not yet scored
      </span>
    );
  }

  const config = BAND_CONFIG[band];
  const label = variant === "full" ? config.fullLabel : config.label;

  return (
    <span
      className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass} ${className}`}
    >
      {config.icon("h-3 w-3 shrink-0")}
      <span>{label}</span>
    </span>
  );
}
