import { Controller, Get } from "@nestjs/common";
import { SUBSCRIPTION_PLANS_CATALOG } from "./subscription-plans.catalog";
import { SubscriptionPlanDto } from "./dto/monetization-response.dto";

/**
 * GET /v1/subscription-plans — public pricing-page data. No auth, no DB
 * lookup: subscription pricing is a small static catalog (see
 * `subscription-plans.catalog.ts`), not user-generated data.
 */
@Controller("subscription-plans")
export class SubscriptionPlansController {
  @Get()
  list(): SubscriptionPlanDto[] {
    return SUBSCRIPTION_PLANS_CATALOG;
  }
}
