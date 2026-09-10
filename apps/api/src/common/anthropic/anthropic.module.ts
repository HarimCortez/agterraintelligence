import { Global, Module } from "@nestjs/common";
import { AnthropicToolCallerService } from "./anthropic-tool-caller.service";

/**
 * Global module (mirrors `PrismaModule`'s pattern) so any current or future
 * domain module can inject `AnthropicToolCallerService` — the shared
 * "call Claude with a forced tool-use" mechanism — without re-declaring the
 * dependency. Used today by `AiAnalysisModule` (free AI Analyst) and
 * `MonetizationModule` (purchased report generation).
 */
@Global()
@Module({
  providers: [AnthropicToolCallerService],
  exports: [AnthropicToolCallerService],
})
export class AnthropicModule {}
