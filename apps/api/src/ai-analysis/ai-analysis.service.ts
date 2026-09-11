import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { AnthropicToolCallerService } from "../common/anthropic/anthropic-tool-caller.service";
import { PropertiesService } from "../properties/properties.service";
import { toPropertyDetail } from "../properties/properties.serializers";
import { AiAnalysisResponseDto } from "./dto/ai-analysis-response.dto";
import { buildSystemPrompt, buildUserPrompt, DEFAULT_QUESTION } from "./ai-analysis.prompt";
import { InvalidAnalysisShapeError, parseAnalysisToolInput, SUBMIT_ANALYSIS_TOOL, SUBMIT_ANALYSIS_TOOL_NAME } from "./ai-analysis.tool";

const CONTEXT_TYPE_PROPERTY = "property";
// 1024 was too tight in practice: a real six-field tool response (conclusion,
// multi-entry evidence/risks/sources arrays, nextAction) can run past that,
// and Claude was observed truncating mid-JSON — producing tool_use input that
// fails parseAnalysisToolInput on whichever field the cutoff landed on
// (observed: a malformed `sources`, and separately an empty `nextAction`).
// 2048 gives real headroom without materially raising cost/latency for what
// is still a short structured answer, not free-form generation.
const MAX_RESPONSE_TOKENS = 2048;

/**
 * AI Analyst service — single-property context only for v1 (REQUIREMENTS.md
 * decision log item 7). Loads real property data (reusing
 * `PropertiesService.getPropertyById`, not a duplicated query), assembles a
 * guardrail-encoding prompt, and forces a structured tool-use response from
 * Claude via the Anthropic Messages API.
 *
 * ## Failure modes and handling (explicit, per team AI-feature policy)
 *
 * 1. **`ANTHROPIC_API_KEY` missing or invalid.** Missing: detected before
 *    any API call, thrown as `ServiceUnavailableException` (503) with a
 *    generic user-safe message. Invalid (present but rejected by
 *    Anthropic): caught from the SDK call itself and mapped to the same
 *    503 — we never leak SDK/auth error internals to the client.
 * 2. **Anthropic API error (network, rate limit, 5xx, timeout).** Caught
 *    generically around the `messages.create` call, logged server-side via
 *    `Logger.error` with property id / question / underlying error, and
 *    surfaced to the client as a 503. This is a real user-facing failure
 *    (the feature is unavailable right now), not a 500 — nothing on our
 *    side is broken.
 * 3. **Model returns a malformed / incomplete tool call** (wrong tool,
 *    missing tool_use block, or a shape that fails `parseAnalysisToolInput`
 *    despite the forced schema). Logged via `Logger.error` and mapped to
 *    503 — a bad structured-output attempt is not something we can safely
 *    hand to the client, and it should not silently degrade into free text.
 *
 * ## Shared Anthropic-calling mechanism
 *
 * The actual "call Claude with a forced tool-use, extract the tool_use
 * block" mechanics live in `AnthropicToolCallerService` (see that class's
 * doc comment) — extracted there so purchased-report generation
 * (`ReportGenerationService`) reuses the exact same mechanism rather than
 * duplicating it. This class still owns: building this feature's specific
 * prompts, validating the tool input against `AiAnalysisResult`'s shape,
 * and this feature's own success-only interaction-logging decision below.
 *
 * ## Interaction logging decision (explicit)
 *
 * Only **successful** analyses (a fully parsed, six-field result) are
 * written to `ai_interactions`. Failed/errored calls are logged via
 * `Logger.error` (visible in ordinary application/ops logs and any log
 * aggregation) but NOT written to `ai_interactions`. Rationale: the
 * `response` column is a required JSONB field intended to hold a genuine
 * structured analysis for downstream AI-monitoring/audit consumers
 * (ARCHITECTURE.md's "AI & Model Monitoring" admin module reads this
 * table); writing null/placeholder rows for failures would force every
 * consumer of `ai_interactions` to filter out non-answers, and would
 * conflate "the model answered and here's what it said" with "the call
 * never completed." If/when a dedicated AI-monitoring pipeline needs
 * failure-rate visibility, add a separate `ai_interaction_failures` table
 * or a nullable `response`/`status` column rather than overloading this
 * one — flagged here for `data`/`be` follow-up, not solved silently.
 */
@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly anthropicCaller: AnthropicToolCallerService,
  ) {}

  async askAboutProperty(propertyId: string, question?: string): Promise<AiAnalysisResponseDto> {
    // Reuses the existing property-lookup logic (throws NotFoundException
    // for a missing property, same as GET /v1/properties/:id) rather than
    // re-querying or duplicating the SQL.
    const row = await this.propertiesService.getPropertyById(propertyId);
    const property = toPropertyDetail(row);

    // claude-haiku-4-5, not claude-sonnet-5: verified via a real call (see
    // AI_MODEL in .env.example) that Haiku 4.5 produces the same valid
    // six-field structured output at materially lower cost — Sonnet's
    // extra reasoning depth isn't needed for this task.
    const model = this.config.get<string>("AI_MODEL", "claude-haiku-4-5-20251001");

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(property, question);

    // Anthropic-calling mechanics (lazy client, forced tool_choice,
    // error -> 503 mapping, missing tool_use -> 503 mapping) live in the
    // shared AnthropicToolCallerService — see that class's doc comment.
    const { input, stopReason, outputTokens } = await this.anthropicCaller.callForcedTool({
      model,
      maxTokens: MAX_RESPONSE_TOKENS,
      systemPrompt,
      userPrompt,
      tool: SUBMIT_ANALYSIS_TOOL,
      toolName: SUBMIT_ANALYSIS_TOOL_NAME,
      feature: "ai_analyst",
      logContext: `property ${propertyId}`,
    });

    let result;
    try {
      result = parseAnalysisToolInput(input);
    } catch (error) {
      const detail = error instanceof InvalidAnalysisShapeError ? error.message : String(error);
      this.logger.error(
        `Anthropic tool response for property ${propertyId} failed validation: ${detail} (stop_reason=${stopReason}, output_tokens=${outputTokens})`,
      );
      throw new ServiceUnavailableException(
        "AI Analyst could not produce a valid analysis. Please try again shortly.",
      );
    }

    const effectiveQuestion = question && question.trim().length > 0 ? question.trim() : null;

    // Log on success only — see class-level doc for the failure-logging
    // decision. Not awaited-and-swallowed: a logging failure here should
    // surface as a 500 rather than silently pretending the interaction was
    // recorded, since ai_interactions is the audit trail for this feature.
    await this.prisma.aiInteraction.create({
      data: {
        propertyId,
        contextType: CONTEXT_TYPE_PROPERTY,
        question: effectiveQuestion,
        response: { ...result },
        modelVersion: model,
      },
    });

    return {
      propertyId,
      question: effectiveQuestion ?? DEFAULT_QUESTION,
      ...result,
    };
  }
}
