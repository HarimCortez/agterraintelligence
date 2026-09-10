import { BarChartIcon, CheckmarkIcon, QuestionMarkIcon, SparkleIcon } from "../icons";

export type DataConfidence = "verified" | "modeled" | "ai_inferred" | "unknown";

export interface DataConfidenceBadgeProps {
  confidence: DataConfidence;
  className?: string;
}

const CONFIG: Record<
  DataConfidence,
  {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: (className: string) => JSX.Element;
  }
> = {
  verified: {
    label: "Verified",
    bgClass: "bg-confidence-verified-bg",
    textClass: "text-confidence-verified-text",
    borderClass: "",
    icon: (c) => <CheckmarkIcon className={c} />,
  },
  modeled: {
    label: "Modeled estimate",
    bgClass: "bg-confidence-modeled-bg",
    textClass: "text-confidence-modeled-text",
    borderClass: "border border-dashed border-confidence-modeled-border",
    icon: (c) => <BarChartIcon className={c} />,
  },
  ai_inferred: {
    label: "AI inferred",
    bgClass: "bg-confidence-ai-inferred-bg",
    textClass: "text-confidence-ai-inferred-text",
    borderClass: "",
    icon: (c) => <SparkleIcon className={c} />,
  },
  unknown: {
    label: "Unknown",
    bgClass: "bg-confidence-unknown-bg",
    textClass: "text-confidence-unknown-text",
    borderClass: "border border-dashed border-confidence-unknown-border",
    icon: (c) => <QuestionMarkIcon className={c} />,
  },
};

/**
 * Data-confidence indicator — deliberately a different hue family (blue →
 * violet → slate) and fill grammar (tint/outline only, dashed border =
 * provenance uncertainty) from both Opportunity Score and Risk Flag badges,
 * per DESIGN-SYSTEM.md "Data Confidence Indicator". Always pairs icon +
 * label; never color alone.
 */
export function DataConfidenceBadge({ confidence, className = "" }: DataConfidenceBadgeProps) {
  const config = CONFIG[confidence];
  return (
    <span
      className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass} ${className}`}
    >
      {config.icon("h-3 w-3 shrink-0")}
      <span>{config.label}</span>
    </span>
  );
}
