/**
 * The four confidence levels the AI Response Pattern (REQUIREMENTS.md
 * Section 8.3 / ARCHITECTURE.md AI Layer) allows — no other string is a
 * valid confidence value. "unknown" is a first-class value, not an error
 * case: the platform must be able to say "we don't know" rather than
 * fabricate certainty.
 */
export const AI_CONFIDENCE_LEVELS = ["high", "moderate", "limited", "unknown"] as const;
export type AiConfidence = (typeof AI_CONFIDENCE_LEVELS)[number];

/**
 * The mandatory six-part structured shape every AI response must carry,
 * per REQUIREMENTS.md's decision log and ARCHITECTURE.md's AI Layer /
 * Data Flow sections. This is also exactly the JSON shape persisted into
 * `ai_interactions.response`.
 */
export interface AiAnalysisResult {
  conclusion: string;
  evidence: string[];
  risks: string[];
  confidence: AiConfidence;
  sources: string[];
  nextAction: string;
}

/**
 * Response DTO for POST /v1/properties/:id/ai/ask. Echoes back propertyId
 * and the (possibly defaulted) question alongside the six-part structured
 * result, so a client never has to separately track which property/question
 * a given answer corresponds to.
 */
export class AiAnalysisResponseDto implements AiAnalysisResult {
  propertyId!: string;
  question!: string | null;
  conclusion!: string;
  evidence!: string[];
  risks!: string[];
  confidence!: AiConfidence;
  sources!: string[];
  nextAction!: string;
}
