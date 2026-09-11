import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { IdentityAccessModule } from "./identity-access/identity-access.module";
import { PropertiesModule } from "./properties/properties.module";
import { AiAnalysisModule } from "./ai-analysis/ai-analysis.module";
import { WatchlistModule } from "./watchlist/watchlist.module";
import { SavedSearchesModule } from "./saved-searches/saved-searches.module";
import { AnthropicModule } from "./common/anthropic/anthropic.module";
import { AuditLogModule } from "./common/audit/audit-log.module";
import { MonetizationModule } from "./monetization/monetization.module";
import { AdminBillingModule } from "./admin-billing/admin-billing.module";
import { AdminReportFulfillmentModule } from "./admin-report-fulfillment/admin-report-fulfillment.module";
import { AdminRevenueModule } from "./admin-revenue/admin-revenue.module";
import { AdminAuditModule } from "./admin-audit/admin-audit.module";
import { AdminIngestionModule } from "./admin-ingestion/admin-ingestion.module";
import { SupportModule } from "./support/support.module";
import { AdminSupportModule } from "./admin-support/admin-support.module";

/**
 * Root application module.
 *
 * Phase 0: Identity & Access (both auth planes, `AccountContext`, RBAC) is
 * wired in below. Further domain modules (Property & Geospatial, Scoring,
 * AI, Monetization, Report Fulfillment, etc.) are added the same way as
 * later phases build them out — see ARCHITECTURE.md's "Components
 * Affected" and "Build sequence".
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AnthropicModule,
    AuditLogModule,
    IdentityAccessModule,
    PropertiesModule,
    AiAnalysisModule,
    WatchlistModule,
    SavedSearchesModule,
    MonetizationModule,
    AdminBillingModule,
    AdminReportFulfillmentModule,
    AdminRevenueModule,
    AdminAuditModule,
    AdminIngestionModule,
    SupportModule,
    AdminSupportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
