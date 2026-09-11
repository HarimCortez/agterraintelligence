import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
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
 * `generateReportContent` deliberately does NOT catch-and-map errors to an
 * HTTP response — it's a pure content-generation call. `runGeneration`
 * below is the stateful wrapper (generating -> delivered/failed) shared by
 * both real callers: `StripeWebhookService` (first fulfillment attempt
 * after payment) and `AdminReportFulfillmentService` (an admin retrying a
 * `failed` order — same content-generation call, same status machine, no
 * payment involved). Extracted here specifically so that status-transition
 * logic exists in exactly one place, not duplicated between a webhook
 * handler and an admin action.
 */
@Injectable()
export class ReportGenerationService {
  private readonly logger = new Logger(ReportGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
    private readonly anthropicCaller: AnthropicToolCallerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Transitions a report order through `generating` -> `delivered` (with
   * persisted content) or `generating` -> `failed` (logged, no automatic
   * refund — see the class doc comment on why that's a deliberate
   * non-decision left for manual/admin follow-up). Callers are responsible
   * for confirming the order is in a state where (re)generation is valid
   * (e.g. `StripeWebhookService`'s idempotency guard on first fulfillment,
   * `AdminReportFulfillmentService`'s `failed`-only check on retry) —
   * this method itself doesn't gate on prior status, it just runs the
   * generation attempt and records the outcome.
   */
  async runGeneration(orderId: string): Promise<void> {
    const order = await this.prisma.reportOrder.update({
      where: { id: orderId },
      data: { status: "generating" },
    });

    try {
      const content = await this.generateReportContent(
        order.propertyId,
        order.reportTierCode as ReportTier,
        `report order ${order.id}`,
      );
      await this.prisma.reportOrder.update({
        where: { id: order.id },
        data: { status: "delivered", content: { ...content } },
      });
    } catch (error) {
      // Payment has already succeeded at this point (or, on a retry, was
      // already confirmed on the original attempt). Do NOT attempt an
      // automatic Stripe refund here — issuing a refund is a real
      // financial action that should go through an actual review process
      // (a future admin/support feature), not be triggered silently by an
      // error path. Flagged explicitly, not swallowed: the order is
      // marked `failed` and logged at `error` level for manual follow-up.
      this.logger.error(
        `Report generation failed for order ${order.id} (property ${order.propertyId}, tier ${order.reportTierCode}) — marking failed, NOT issuing a refund: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.reportOrder.update({ where: { id: order.id }, data: { status: "failed" } });
    }
  }

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
