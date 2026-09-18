import { SubscriptionPlan, SubscriptionStatus } from "@agterra/db";

/** GET /v1/subscription-plans — public, pricing-page display data. */
export interface SubscriptionPlanDto {
  plan: "free" | SubscriptionPlan;
  displayName: string;
  priceCentsPerMonth: number;
  /** `false` only for `free` — there's no checkout for it (see catalog). */
  purchasable: boolean;
}

/** GET /v1/report-tiers — public, all four seeded tiers. */
export interface ReportTierDto {
  code: string;
  displayName: string;
  subscriberPriceCents: number;
  nonSubscriberPriceCents: number;
  requiresHumanReview: boolean;
  sortOrder: number;
  /** `false` for `premium` — real pricing-page data, not yet buyable. */
  purchasable: boolean;
}

/** GET /v1/subscriptions/me — authenticated. */
export interface SubscriptionMeDto {
  plan: "free" | SubscriptionPlan;
  status: SubscriptionStatus | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
}

/** POST /v1/subscriptions/checkout response. */
export interface SubscriptionCheckoutResponseDto {
  checkoutUrl: string;
}

/** POST /v1/subscriptions/billing-portal response. */
export interface BillingPortalResponseDto {
  portalUrl: string;
}

/** POST /v1/properties/:id/reports/checkout response. */
export interface ReportCheckoutResponseDto {
  checkoutUrl: string;
  orderId: string;
  priceCents: number;
  upgradeCreditAppliedCents: number;
}

/**
 * GET /v1/properties/:id/reports/pricing — authenticated, per-investor
 * pricing preview across all four seeded tiers. Deliberately omits an
 * `alreadyOwned` field — `fe` derives that from the sibling
 * `GET /v1/properties/:id/reports` response it already needs, to avoid a
 * second, independently-computed source of the same fact.
 */
export interface ReportPricingDto {
  tierCode: string;
  displayName: string;
  /** `false` for `premium` — mirrors `ReportTierDto.purchasable`. */
  purchasable: boolean;
  /** This investor's applicable base price (subscriber or non-subscriber). */
  priceCents: number;
  priceBasis: "subscriber" | "non_subscriber";
  /** 0 if no lower delivered tier owned on this property. */
  upgradeCreditAppliedCents: number;
  /** max(priceCents - upgradeCreditAppliedCents, 0). */
  netPriceCents: number;
}

/** GET /v1/properties/:id/reports and GET /v1/report-orders/:id. */
export interface ReportOrderDto {
  id: string;
  propertyId: string;
  reportTierCode: string;
  pricePaidCents: number;
  priceBasis: string;
  upgradeCreditAppliedCents: number;
  status: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}
