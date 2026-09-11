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
