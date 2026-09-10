import { IsIn } from "class-validator";

/**
 * Self-serve subscription plans a user can actually check out into. `free`
 * is deliberately excluded — it's the absence of a `Subscription` row, not
 * something Stripe Checkout ever creates (see schema.prisma's monetization
 * header comment). Institutional is out of scope (custom-quoted).
 */
export const PURCHASABLE_SUBSCRIPTION_PLANS = ["basic", "investor", "professional"] as const;
export type PurchasableSubscriptionPlan = (typeof PURCHASABLE_SUBSCRIPTION_PLANS)[number];

export class CheckoutSubscriptionDto {
  @IsIn(PURCHASABLE_SUBSCRIPTION_PLANS)
  plan!: PurchasableSubscriptionPlan;
}
