import type { ReactNode } from "react";
import { BarChartIcon, CheckmarkIcon, QuestionMarkIcon, SparkleIcon } from "../icons";

/**
 * The four confidence levels the AI Response Pattern allows (mirrors
 * `apps/api/src/ai-analysis/dto/ai-analysis-response.dto.ts`'s
 * `AI_CONFIDENCE_LEVELS`, duplicated here rather than imported — this
 * package has no dependency on the API app, same pattern as
 * investor-web's `properties-api.ts` duplicating `ValuationConfidence`).
 */
export type AiConfidence = "high" | "moderate" | "limited" | "unknown";

/**
 * The mandatory six-part structured shape every AI response carries, per
 * REQUIREMENTS.md Section 8.3 / ARCHITECTURE.md's AI Layer. This is the
 * prop shape for the shared renderer below — callers may pass a response
 * object with extra fields (e.g. the API's `propertyId`/`question` echo)
 * since only these six are read here.
 */
export interface AiAnalysisResultData {
  conclusion: string;
  evidence: string[];
  risks: string[];
  confidence: AiConfidence;
  sources: string[];
  nextAction: string;
}

export interface AiAnalysisResultProps {
  result: AiAnalysisResultData;
  className?: string;
}

const CONFIDENCE_CONFIG: Record<
  AiConfidence,
  {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    icon: (className: string) => ReactNode;
  }
> = {
  // Confidence badge reuses the Data Confidence family's blue→violet→slate
  // hue ramp and solid/dashed-border grammar (DESIGN-SYSTEM.md's Data
  // Confidence Indicator) rather than inventing new colors — this is a
  // different semantic axis (the AI's own confidence in its answer, not
  // data provenance) but the same underlying idea ("how much should you
  // trust this"), and the ramp maps cleanly: high (solid, most trustworthy)
  // -> moderate (dashed, estimated) -> limited (weaker signal) -> unknown
  // (dashed, least trustworthy). See AiAnalystPanel/AiAnalysisResult
  // implementation notes for the full rationale.
  high: {
    label: "High confidence",
    bgClass: "bg-confidence-verified-bg",
    textClass: "text-confidence-verified-text",
    borderClass: "",
    icon: (c) => <CheckmarkIcon className={c} />,
  },
  moderate: {
    label: "Moderate confidence",
    bgClass: "bg-confidence-modeled-bg",
    textClass: "text-confidence-modeled-text",
    borderClass: "border border-dashed border-confidence-modeled-border",
    icon: (c) => <BarChartIcon className={c} />,
  },
  limited: {
    label: "Limited confidence",
    bgClass: "bg-confidence-ai-inferred-bg",
    textClass: "text-confidence-ai-inferred-text",
    borderClass: "",
    icon: (c) => <SparkleIcon className={c} />,
  },
  unknown: {
    label: "Confidence unknown",
    bgClass: "bg-confidence-unknown-bg",
    textClass: "text-confidence-unknown-text",
    borderClass: "border border-dashed border-confidence-unknown-border",
    icon: (c) => <QuestionMarkIcon className={c} />,
  },
};

function AiConfidenceBadge({ confidence }: { confidence: AiConfidence }) {
  const config = CONFIDENCE_CONFIG[confidence];
  return (
    <span
      className={`inline-flex items-center gap-xs rounded px-sm py-xs text-xs font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass}`}
    >
      {config.icon("h-3 w-3 shrink-0")}
      <span>{config.label}</span>
    </span>
  );
}

/** The six section labels' shared typography treatment, defined once here. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
      {children}
    </p>
  );
}

/**
 * Evidence/Risks body-paragraph treatment — `base`/prose-measure/
 * prose-line-height, per DESIGN-SYSTEM.md's Implementation Notes for this
 * exact component. `max-w-prose` (65ch) and `leading-[var(--leading-prose)]`
 * (1.5) are both pre-existing tokens reserved for this purpose.
 */
function ProseList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="mt-xs max-w-prose text-sm text-text-secondary">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-xs flex max-w-prose flex-col gap-sm text-base leading-[var(--leading-prose)] text-text-primary">
      {items.map((item, i) => (
        <li key={i} className="flex gap-sm">
          <span aria-hidden="true" className="text-text-secondary">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Structured AI response renderer — the single shared component rendering
 * Conclusion → Evidence → Risks → Confidence → Sources → Next-action, per
 * ARCHITECTURE.md's Shared Components list ("one structured AI response
 * renderer... every AI surface consumes this one component rather than
 * each screen reimplementing the pattern"). Every AI surface (Property
 * Intelligence Page's AI Analyst panel today; the AI Analyst Drawer, report
 * Q&A, and portfolio recommendations later) renders through this component,
 * not a bespoke rendering of the six fields.
 *
 * Typography (DESIGN-SYSTEM.md Implementation Notes, defined once here per
 * Architecture's "single place the pattern is rendered" instruction):
 * - Six section labels: `xs`/Semibold/`--tracking-label`.
 * - Evidence/Risks body paragraphs: `base`/prose-measure/prose-line-height.
 * - `conclusion`: `headline-serif` (24px Source Serif 4 Semibold) — the
 *   token DESIGN-SYSTEM.md reserves for "investment-thesis headline
 *   conclusions (the single-sentence AI-generated thesis statement)."
 *
 * The trailing AI-generated/not-a-substitute-for-professional-due-diligence
 * disclaimer lives here (not in each calling screen) for the same reason:
 * it should appear identically wherever this pattern is rendered, and the
 * backend's guardrails (see `AiAnalysisService`) already bias `nextAction`
 * toward recommending professional verification when relevant — the UI
 * chrome should reinforce, not contradict, that this isn't definitive
 * platform data the way Opportunity Score or valuation are.
 */
export function AiAnalysisResult({ result, className = "" }: AiAnalysisResultProps) {
  return (
    <div className={`flex flex-col gap-lg ${className}`}>
      <div className="flex items-center gap-xs text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
        <SparkleIcon className="h-3 w-3 shrink-0" />
        <span>AI-generated analysis</span>
      </div>

      <section aria-label="Conclusion">
        <SectionLabel>Conclusion</SectionLabel>
        {/* Scaled down from text-headline-serif (24px) to text-lg (18px) —
            the full headline size read as oversized for a multi-sentence
            conclusion in practice. Keeps font-serif + font-semibold so it
            still stands out from the sans body text below it, just less
            aggressively. */}
        <p className="mt-xs max-w-prose font-serif text-lg font-semibold leading-[1.4] text-text-primary">
          {result.conclusion}
        </p>
      </section>

      <section aria-label="Evidence">
        <SectionLabel>Evidence</SectionLabel>
        <ProseList items={result.evidence} emptyLabel="No supporting evidence provided." />
      </section>

      <section aria-label="Risks">
        <SectionLabel>Risks</SectionLabel>
        <ProseList items={result.risks} emptyLabel="No risks noted." />
      </section>

      <section aria-label="Confidence">
        <SectionLabel>Confidence</SectionLabel>
        <div className="mt-xs">
          <AiConfidenceBadge confidence={result.confidence} />
        </div>
      </section>

      <section aria-label="Sources">
        <SectionLabel>Sources</SectionLabel>
        {result.sources.length === 0 ? (
          <p className="mt-xs text-sm text-text-secondary">No sources cited.</p>
        ) : (
          <ul className="mt-xs flex flex-col gap-xs text-sm text-text-secondary">
            {result.sources.map((source, i) => (
              <li key={i}>{source}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Next action">
        <SectionLabel>Next Action</SectionLabel>
        <p className="mt-xs text-sm text-text-primary">{result.nextAction}</p>
      </section>

      <p className="border-t border-border-subtle pt-sm text-xs text-text-secondary">
        AI-generated analysis for informational purposes only — not a substitute for professional due
        diligence, legal, or financial advice.
      </p>
    </div>
  );
}
