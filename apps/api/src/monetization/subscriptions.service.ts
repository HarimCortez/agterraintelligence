import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { StripeClientService } from "./stripe-client.service";
import { getSubscriptionPlanCatalogEntry } from "./subscription-plans.catalog";
import { CheckoutSubscriptionDto } from "./dto/checkout-subscription.dto";
import { SubscriptionCheckoutResponseDto, SubscriptionMeDto } from "./dto/monetization-response.dto";
import { SUBSCRIPTION_CHECKOUT_CANCEL_URL, SUBSCRIPTION_CHECKOUT_SUCCESS_URL } from "./checkout-urls";

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClientService,
  ) {}

  /**
   * GET /v1/subscriptions/me. Scoped to the current account (`ctx.scopeId`
   * — never a bare `userId`, per the org-seam convention every account-
   * scoped query in this codebase follows). Returns a clear "free tier, no
   * subscription" shape when no `Subscription` row exists, rather than
   * null/404 — free is a real, valid state, not an error.
   */
  async getMe(ctx: AccountContext): Promise<SubscriptionMeDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: ctx.scopeId },
    });

    if (!subscription) {
      return { plan: "free", status: null, currentPeriodEnd: null, stripeCustomerId: null };
    }

    return {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      stripeCustomerId: subscription.stripeCustomerId,
    };
  }

  /**
   * POST /v1/subscriptions/checkout. Creates a Stripe Checkout Session in
   * `subscription` mode using inline `price_data` (no pre-created Stripe
   * Price objects — see `subscription-plans.catalog.ts`'s header comment).
   * `userId`/`plan` are embedded in session metadata so
   * `StripeWebhookService` can act on `checkout.session.completed` without
   * trusting anything the client sends at webhook time.
   */
  async createCheckout(
    ctx: AccountContext,
    dto: CheckoutSubscriptionDto,
    userEmail: string,
  ): Promise<SubscriptionCheckoutResponseDto> {
    const planEntry = getSubscriptionPlanCatalogEntry(dto.plan);
    if (!planEntry || !planEntry.purchasable) {
      // Defensive only — the DTO's @IsIn already restricts `plan` to the
      // three purchasable codes, so this should be unreachable.
      throw new BadRequestException(`Plan is not available for checkout: ${dto.plan}`);
    }

    // Fails clean with a 503 if STRIPE_SECRET_KEY isn't configured — no
    // Stripe account/keys are provisioned yet as of this pass.
    const stripe = this.stripeClient.getClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `AgTerra ${planEntry.displayName} Plan` },
            unit_amount: planEntry.priceCentsPerMonth,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: SUBSCRIPTION_CHECKOUT_SUCCESS_URL,
      cancel_url: SUBSCRIPTION_CHECKOUT_CANCEL_URL,
      customer_email: userEmail,
      metadata: { userId: ctx.scopeId, plan: dto.plan },
      subscription_data: { metadata: { userId: ctx.scopeId, plan: dto.plan } },
      // See report-orders.service.ts for why this is disabled — applied here
      // too for consistency, even though subscription-mode sessions weren't
      // observed hitting the same Managed Payments tax_code requirement.
      managed_payments: { enabled: false },
    });

    if (!session.url) {
      throw new ServiceUnavailableException("Stripe did not return a checkout URL");
    }

    return { checkoutUrl: session.url };
  }
}
