import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Request body for POST /v1/properties/:id/ai/ask.
 *
 * `question` is optional — when omitted, the service falls back to the
 * implicit question "explain this property's investment case and
 * Opportunity Score" (see AiAnalysisService.DEFAULT_QUESTION).
 *
 * Max length of 500 chars is a deliberate cost/abuse control: this endpoint
 * makes a real, billed Anthropic API call per request (see
 * ai-analysis.module.ts's throttle rationale), so the request body itself
 * should not be a vector for oversized/expensive prompts.
 */
export class AskAiDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "question must not exceed 500 characters" })
  question?: string;
}
