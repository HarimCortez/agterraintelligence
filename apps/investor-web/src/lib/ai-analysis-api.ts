/**
 * POST /v1/properties/:id/ai/ask client — request/response types + fetch,
 * mirroring `properties-api.ts`'s base-URL resolution pattern (server calls
 * the API directly; browser calls the same-origin `/api/*` rewrite).
 *
 * Verified against `apps/api/src/ai-analysis/{ai-analysis.controller.ts,
 * ai-analysis.service.ts, dto/ai-analysis-response.dto.ts, dto/ask-ai.dto.ts}`,
 * not guessed at.
 */

export type AiConfidence = "high" | "moderate" | "limited" | "unknown";

export interface AiAnalysisResponse {
  propertyId: string;
  question: string | null;
  conclusion: string;
  evidence: string[];
  risks: string[];
  confidence: AiConfidence;
  sources: string[];
  nextAction: string;
}

export const AI_QUESTION_MAX_LENGTH = 500;

function resolveBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:3001";
  }
  return "/api";
}

/**
 * Thrown for the endpoint's 503 — `AiAnalysisService` collapses three
 * distinct failure modes (no `ANTHROPIC_API_KEY` configured, the Anthropic
 * API call itself failing, or a malformed model response) into one
 * user-safe 503, so the client can't and shouldn't distinguish them either.
 * This is the case you'll actually observe in practice right now: no key is
 * provisioned yet, so every real call 503s.
 */
export class AiAnalysisUnavailableError extends Error {}

/**
 * Thrown for the endpoint's 429 — the controller's 3-requests/15-minute
 * per-IP throttle (`@Throttle({ default: { limit: 3, ttl: 900_000 } })`).
 */
export class AiAnalysisRateLimitedError extends Error {}

export async function askAiAboutProperty(
  propertyId: string,
  question?: string,
): Promise<AiAnalysisResponse> {
  const url = `${resolveBaseUrl()}/v1/properties/${encodeURIComponent(propertyId)}/ai/ask`;
  const trimmed = question?.trim();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trimmed ? { question: trimmed } : {}),
    cache: "no-store",
  });

  if (res.status === 503) {
    throw new AiAnalysisUnavailableError(
      (await readErrorMessage(res)) ?? "AI Analyst is temporarily unavailable.",
    );
  }
  if (res.status === 429) {
    throw new AiAnalysisRateLimitedError(
      (await readErrorMessage(res)) ?? "You've reached the AI request limit.",
    );
  }
  if (!res.ok) {
    throw new Error((await readErrorMessage(res)) ?? `AI Analyst request failed (HTTP ${res.status})`);
  }

  return (await res.json()) as AiAnalysisResponse;
}

/** Reads Nest's default `{ statusCode, message, error }` error body, tolerating array `message` (class-validator) and non-JSON bodies. */
async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    return data.message ?? null;
  } catch {
    return null;
  }
}
