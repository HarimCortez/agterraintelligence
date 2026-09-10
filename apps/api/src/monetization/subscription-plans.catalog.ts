import { SubscriptionPlanDto } from "./dto/monetization-response.dto";

/**
 * Confirmed launch subscription prices (REQUIREMENTS.md decision log #9):
 * Free $0/mo, Basic $29/mo, Investor $79/mo, Professional $199/mo.
 * Institutional remains custom-quoted — out of scope for self-serve
 * checkout entirely, not listed here.
 *
 * There is no Stripe Price object backing these — checkout uses inline
 * `price_data` (see `SubscriptionsService.createCheckout`), so this catalog
 * is the single source of truth for subscription pricing on our side.
 *
 * `free` has no `Subscription` row (schema.prisma's monetization header
 * comment: free is the absence of one) — included here only so
 * GET /v1/subscription-plans can show it for pricing-page completeness;
 * `purchasable: false` means there is no checkout endpoint for it.
 */
export const SUBSCRIPTION_PLANS_CATALOG: SubscriptionPlanDto[] = [
  { plan: "free", displayName: "Free", priceCentsPerMonth: 0, purchasable: false },
  { plan: "basic", displayName: "Basic", priceCentsPerMonth: 2900, purchasable: true },
  { plan: "investor", displayName: "Investor", priceCentsPerMonth: 7900, purchasable: true },
  { plan: "professional", displayName: "Professional", priceCentsPerMonth: 19900, purchasable: true },
];

export function getSubscriptionPlanCatalogEntry(
  plan: string,
): SubscriptionPlanDto | undefined {
  return SUBSCRIPTION_PLANS_CATALOG.find((entry) => entry.plan === plan);
}
