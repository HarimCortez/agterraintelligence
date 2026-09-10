import { Module } from "@nestjs/common";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";

/**
 * Property & Geospatial domain module (first-pass slice) — provides the
 * public-facing GET /v1/properties list/search endpoint with powerful
 * filtering and sorting capabilities.
 *
 * No authentication required (free-tier browsing persona); rate limiting is
 * handled by the global throttler at the identity-access module level.
 *
 * The PrismaService is injected from PrismaModule (a @Global() module at
 * the identity-access level), so no re-import needed here.
 */
@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService],
  // Exported so AiAnalysisModule can reuse `getPropertyById` (single-property
  // lookup + 404 handling) instead of duplicating the query — see
  // ai-analysis/ai-analysis.module.ts.
  exports: [PropertiesService],
})
export class PropertiesModule {}
