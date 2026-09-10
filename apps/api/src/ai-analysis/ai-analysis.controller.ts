import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AiAnalysisService } from "./ai-analysis.service";
import { AskAiDto } from "./dto/ask-ai.dto";
import { AiAnalysisResponseDto } from "./dto/ai-analysis-response.dto";

/**
 * AI Analyst — `/v1/properties/:id/ai/ask`. Fully public (no auth), same as
 * every other investor-facing endpoint built so far (REQUIREMENTS.md
 * decision log item 7's documented temporary gap against Decision 5 —
 * real Investor-tier gating needs a working entitlement system + login UI,
 * neither of which exists yet).
 *
 * Single-property context only for v1 (no report/comparison/portfolio
 * context — those subsystems don't exist yet).
 *
 * Cost control: this is the one endpoint in the app that triggers a real,
 * billed LLM API call per request, so it carries a materially tighter
 * per-IP rate limit than anything else built so far (compare
 * InvestorAuthController's tightest route, register at 5/10min) — 3
 * requests per 15 minutes per IP. Rationale: cheap enough to demo/evaluate
 * comfortably in one sitting, expensive enough to abuse (repeated calls)
 * that a scripted hammering attempt gets meaningfully throttled well before
 * it runs up a real API bill. This is a blunt per-IP guardrail, not a
 * substitute for the real subscription-tier gating (Decision 5) once
 * accounts/entitlements exist.
 */
@Controller("properties/:id/ai")
export class AiAnalysisController {
  constructor(private readonly aiAnalysisService: AiAnalysisService) {}

  @Post("ask")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900_000 } }) // 3 / 15 min per IP
  ask(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AskAiDto,
  ): Promise<AiAnalysisResponseDto> {
    return this.aiAnalysisService.askAboutProperty(id, dto.question);
  }
}
