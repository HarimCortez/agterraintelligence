import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { InvestorAuthModule } from "../identity-access/investor/investor-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { StripeClientService } from "./stripe-client.service";
import { SubscriptionPlansController } from "./subscription-plans.controller";
import { ReportTiersController } from "./report-tiers.controller";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { PropertyReportsController } from "./property-reports.controller";
import { ReportOrdersController } from "./report-orders.controller";
import { ReportOrdersService } from "./report-orders.service";
import { ReportGenerationService } from "./report-generation.service";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { StripeWebhookService } from "./stripe-webhook.service";

/**
 * Monetization domain module (ARCHITECTURE.md's Monetization section):
 * subscription plans, the report-tier catalog, report purchase/fulfillment,
 * and the Stripe integration (Checkout Sessions + webhook) behind all of
 * it.
 *
 * Imports `PropertiesModule` to reuse `PropertiesService.getPropertyById`
 * (existing 404 handling) rather than duplicating property lookups.
 * `PrismaService` (global) and `AnthropicToolCallerService` (global, see
 * `AnthropicModule`) are available without importing anything extra here.
 * `InvestorAuthModule`/`TokensModule` are imported so `JwtAuthGuard` (and
 * its own `TokenService` dependency) resolve here — same pattern
 * `WatchlistModule`/`SavedSearchesModule` already use.
 */
@Module({
  imports: [PropertiesModule, TokensModule, InvestorAuthModule],
  controllers: [
    SubscriptionPlansController,
    ReportTiersController,
    SubscriptionsController,
    PropertyReportsController,
    ReportOrdersController,
    StripeWebhookController,
  ],
  providers: [
    StripeClientService,
    SubscriptionsService,
    ReportOrdersService,
    ReportGenerationService,
    StripeWebhookService,
  ],
})
export class MonetizationModule {}
