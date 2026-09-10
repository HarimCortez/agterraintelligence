import type { ReactNode } from "react";
import { FlagOutlineIcon, FlagFilledIcon, ExclamationTriangleIcon } from "../icons";

export type RiskSeverity = "low" | "medium" | "high";

export interface RiskFlagBadgeProps {
  severity: RiskSeverity;
  className?: string;
}

const SEVERITY_CONFIG: Record<
  RiskSeverity,
  {
    label: string;
    bgClass: string;
    textClass: string;
    icon: (className: string) => ReactNode;
  }
> = {
  low: {
    label: "Low risk",
    bgClass: "bg-risk-low-bg",
    textClass: "text-risk-low-text",
    icon: (className) => <FlagOutlineIcon className={className} />,
  },
  medium: {
    label: "Medium risk",
    bgClass: "bg-risk-medium-bg",
    textClass: "text-risk-medium-text",
    icon: (className) => <FlagFilledIcon className={className} />,
  },
  high: {
    label: "High risk",
    bgClass: "bg-risk-high-bg",
    textClass: "text-risk-high-text",
    icon: (className) => (
      <span className={`inline-flex items-center gap-[2px] ${className}`}>
        <FlagFilledIcon className="h-3 w-3 shrink-0" />
        <ExclamationTriangleIcon className="h-3 w-3 shrink-0" />
      </span>
    ),
  },
};

/**
 * Risk severity badge — full-detail treatment for the Property Intelligence
 * Page (property-detail endpoint exposes real per-flag severity, unlike the
 * list endpoint's count-only `RiskFlagCountBadge`). Implements
 * DESIGN-SYSTEM.md's "Risk Flag Badge — Severity" table exactly: tint fill
 * for Low, solid fill for Medium/High, with three independent escalating
 * cues (fill weight, icon glyph *and count* — High adds a second
 * exclamation-triangle glyph alongside the flag — and the mandatory label
 * text), never color alone.
 */
export function RiskFlagBadge({ severity, className = "" }: RiskFlagBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold ${config.bgClass} ${config.textClass} ${className}`}
    >
      {config.icon("h-3 w-3 shrink-0")}
      <span>{config.label}</span>
    </span>
  );
}
