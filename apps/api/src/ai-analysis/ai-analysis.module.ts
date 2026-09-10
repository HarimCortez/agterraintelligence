import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { AiAnalysisController } from "./ai-analysis.controller";
import { AiAnalysisService } from "./ai-analysis.service";

/**
 * AI Layer (ARCHITECTURE.md "Components Affected" #4, first-pass slice) —
 * single-property AI Analyst Q&A / thesis generation.
 *
 * Imports `PropertiesModule` (which now exports `PropertiesService`) so
 * property lookup reuses the existing `getPropertyById` query/404 handling
 * instead of duplicating it. `PrismaService` (for `ai_interactions`
 * logging) comes from the global `PrismaModule`, so no import needed here.
 *
 * Per-route rate limiting (`@Throttle` on `AiAnalysisController`) layers on
 * top of the app-wide default `ThrottlerGuard` already registered in
 * `IdentityAccessModule`.
 */
@Module({
  imports: [PropertiesModule],
  controllers: [AiAnalysisController],
  providers: [AiAnalysisService],
})
export class AiAnalysisModule {}
