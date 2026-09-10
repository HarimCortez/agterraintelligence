import type Anthropic from "@anthropic-ai/sdk";
import { AI_CONFIDENCE_LEVELS, AiAnalysisResult } from "./dto/ai-analysis-response.dto";

/**
 * Name of the single tool we force Claude to call. Using tool-use with a
 * forced `tool_choice` (see AiAnalysisService.callModel) is the reliable
 * mechanism for guaranteeing parseable structured output — we do not ask
 * the model to format free text a certain way and hope it complies.
 */
export const SUBMIT_ANALYSIS_TOOL_NAME = "submit_analysis";

/**
 * JSON-schema tool definition matching the mandatory six-part AI Response
 * Pattern (conclusion/evidence/risks/confidence/sources/nextAction) from
 * REQUIREMENTS.md's decision log and ARCHITECTURE.md's AI Layer. Every
 * field is required — there is no valid partial response.
 */
export const SUBMIT_ANALYSIS_TOOL: Anthropic.Tool = {
  name: SUBMIT_ANALYSIS_TOOL_NAME,
  description:
    "Submit the structured investment analysis response. This is the only way to answer — always call this tool exactly once with all six fields populated.",
  input_schema: {
    type: "object",
    properties: {
      conclusion: {
        type: "string",
        description: "A concise, direct answer to the question (or the investment thesis/score explanation if no question was asked).",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "Specific supporting facts drawn only from the property context provided (score, valuation, risk flags, metrics).",
      },
      risks: {
        type: "array",
        items: { type: "string" },
        description: "Risks or caveats that could invalidate the conclusion, including any risk flags present and any relevant missing data.",
      },
      confidence: {
        type: "string",
        enum: [...AI_CONFIDENCE_LEVELS],
        description: "How confident this analysis is, genuinely reflecting the completeness of the data provided (never overstate).",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Citations back to the specific platform data fields actually used (e.g. 'Opportunity Score: 82 (Strong)'). Never an external or fabricated source.",
      },
      nextAction: {
        type: "string",
        description: "A concrete recommended next step for the investor, including a recommendation to seek professional verification if the analysis touches legal, water, title, environmental, or zoning topics.",
      },
    },
    required: ["conclusion", "evidence", "risks", "confidence", "sources", "nextAction"],
  },
};

/** Raised when the model's tool-call input doesn't match the required shape. */
export class InvalidAnalysisShapeError extends Error {}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Validates and narrows the raw `tool_use` block input from the Anthropic
 * response into an `AiAnalysisResult`. Even with a forced tool call and a
 * JSON schema, we do not trust the model's output blindly — this is the
 * guardrail post-processing step described in ARCHITECTURE.md's "AI Q&A /
 * generation path".
 *
 * Throws `InvalidAnalysisShapeError` (never returns a partially-valid
 * object) if any field is missing or the wrong type/enum value.
 */
export function parseAnalysisToolInput(input: unknown): AiAnalysisResult {
  if (typeof input !== "object" || input === null) {
    throw new InvalidAnalysisShapeError("Tool input is not an object");
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.conclusion !== "string" || candidate.conclusion.trim().length === 0) {
    throw new InvalidAnalysisShapeError("conclusion must be a non-empty string");
  }
  if (!isStringArray(candidate.evidence)) {
    throw new InvalidAnalysisShapeError("evidence must be a string array");
  }
  if (!isStringArray(candidate.risks)) {
    throw new InvalidAnalysisShapeError("risks must be a string array");
  }
  if (
    typeof candidate.confidence !== "string" ||
    !(AI_CONFIDENCE_LEVELS as readonly string[]).includes(candidate.confidence)
  ) {
    throw new InvalidAnalysisShapeError(
      `confidence must be one of ${AI_CONFIDENCE_LEVELS.join(", ")}`,
    );
  }
  if (!isStringArray(candidate.sources)) {
    throw new InvalidAnalysisShapeError("sources must be a string array");
  }
  if (typeof candidate.nextAction !== "string" || candidate.nextAction.trim().length === 0) {
    throw new InvalidAnalysisShapeError("nextAction must be a non-empty string");
  }

  return {
    conclusion: candidate.conclusion,
    evidence: candidate.evidence,
    risks: candidate.risks,
    confidence: candidate.confidence as AiAnalysisResult["confidence"],
    sources: candidate.sources,
    nextAction: candidate.nextAction,
  };
}
