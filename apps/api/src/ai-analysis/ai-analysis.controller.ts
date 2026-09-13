import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ExternalRole } from "@agterra/db";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { ExternalRolesGuard } from "../identity-access/investor/external-roles.guard";
import { Roles } from "../identity-access/investor/roles.decorator";
import { AiAnalysisService } from "./ai-analysis.service";
import { AskAiDto } from "./dto/ask-ai.dto";
import { AiAnalysisResponseDto } from "./dto/ai-analysis-response.dto";

/**
 * AI Analyst — `/v1/properties/:id/ai/ask`. Requires login and Investor
 * tier or above (`@Roles(investor_subscriber, professional_subscriber,
 * institutional)`), per REQUIREMENTS.md decision log item 5. This closes
 * decision log item 7's documented temporary gap — that entry noted the
 * endpoint shipped fully public because real tier-gating needed both a
 * working entitlement system and login UI, neither of which existed yet;
 * both now do (subscriptions + investor auth), so the real gate replaces
 * the placeholder.
 *
 * Single-property context only for v1 (no report/comparison/portfolio
 * context — those subsystems don't exist yet).
 *
 * Cost control: this is the one endpoint in the app that triggers a real,
 * billed LLM API call per request, so it still carries a materially
 * tighter per-IP rate limit than anything else built so far (compare
 * InvestorAuthController's tightest route, register at 5/10min) — 3
 * requests per 15 minutes per IP. This now layers on top of the real
 * auth/tier gate rather than substituting for it: even a legitimate
 * Investor-tier account is throttled against a scripted hammering attempt
 * that could otherwise run up a real API bill.
 */
@Controller("properties/:id/ai")
@UseGuards(JwtAuthGuard, ExternalRolesGuard)
@Roles(ExternalRole.investor_subscriber, ExternalRole.professional_subscriber, ExternalRole.institutional)
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
