import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PropertiesService } from "../properties/properties.service";
import { toPropertyDetail } from "../properties/properties.serializers";
import { AnthropicToolCallerService } from "../common/anthropic/anthropic-tool-caller.service";
import { buildSystemPrompt, buildTieredReportUserPrompt, ReportTier } from "../ai-analysis/ai-analysis.prompt";
import {
  InvalidAnalysisShapeError,
  parseAnalysisToolInput,
  SUBMIT_ANALYSIS_TOOL,
  SUBMIT_ANALYSIS_TOOL_NAME,
} from "../ai-analysis/ai-analysis.tool";
import { AiAnalysisResult } from "../ai-analysis/dto/ai-analysis-response.dto";

// Higher than the free AI Analyst's MAX_RESPONSE_TOKENS (2048) — the
// `investor`/`professional` tier instructions in `buildTieredReportUserPrompt`
// explicitly ask for materially more evidence/risk/scenario coverage than a
// thesis-depth answer, so the same truncation failure mode
// `ai-analysis.service.ts` documents fixing at 2048 tokens would recur here
// at that ceiling. Kept as its own constant (not reused from
// ai-analysis.service.ts) since the two call sites now have genuinely
// different depth requirements, not the same one.
const REPORT_MAX_RESPONSE_TOKENS = 4096;

/**
 * Purchased-report content generation (REQUIREMENTS.md decision log #10):
 * a persisted, tier-scoped-depth AI investment analysis, built on the exact
 * same six-field AI Response shape / `submit_analysis` tool the free AI
 * Analyst uses (`ai-analysis.tool.ts`) — only the prompt's depth
 * instruction differs (`buildTieredReportUserPrompt`), not the schema or
 * guardrails (`buildSystemPrompt()` reused unchanged).
 *
 * Calls through the shared `AnthropicToolCallerService` (same mechanism
 * `AiAnalysisService` uses) so the lazy-client / forced-tool-use /
 * missing-tool_use-block handling is never duplicated between the two
 * features.
 *
 * Deliberately does NOT catch-and-map errors to an HTTP response here: this
 * is called from `StripeWebhookService`, which has no HTTP client waiting
 * on the result — it owns the decision of what to do on failure (mark the
 * `ReportOrder` `failed` and log, never a silent swallow or an automatic
 * refund). Any error (503 from `AnthropicToolCallerService`, or
 * `InvalidAnalysisShapeError` from a malformed tool response) propagates to
 * that caller unchanged.
 */
@Injectable()
export class ReportGenerationService {
  private readonly logger = new Logger(ReportGenerationService.name);

  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly anthropicCaller: AnthropicToolCallerService,
    private readonly config: ConfigService,
  ) {}

  async generateReportContent(
    propertyId: string,
    tier: ReportTier,
    logContext: string,
  ): Promise<AiAnalysisResult> {
    const row = await this.propertiesService.getPropertyById(propertyId);
    const property = toPropertyDetail(row);

    const model = this.config.get<string>("AI_MODEL", "claude-sonnet-5");
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildTieredReportUserPrompt(property, tier);

    const { input, stopReason, outputTokens } = await this.anthropicCaller.callForcedTool({
      model,
      maxTokens: REPORT_MAX_RESPONSE_TOKENS,
      systemPrompt,
      userPrompt,
      tool: SUBMIT_ANALYSIS_TOOL,
      toolName: SUBMIT_ANALYSIS_TOOL_NAME,
      logContext,
    });

    try {
      return parseAnalysisToolInput(input);
    } catch (error) {
      const detail = error instanceof InvalidAnalysisShapeError ? error.message : String(error);
      this.logger.error(
        `Report generation tool response for ${logContext} failed validation: ${detail} (stop_reason=${stopReason}, output_tokens=${outputTokens})`,
      );
      throw error;
    }
  }
}
