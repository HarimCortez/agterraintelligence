import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { ExternalRole, SubscriptionPlan, SubscriptionStatus } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { ReportTier } from "../ai-analysis/ai-analysis.prompt";
import { StripeClientService } from "./stripe-client.service";
import { ReportGenerationService } from "./report-generation.service";

const PLAN_TO_EXTERNAL_ROLE: Record<string, ExternalRole> = {
  basic: ExternalRole.basic_subscriber,
  investor: ExternalRole.investor_subscriber,
  professional: ExternalRole.professional_subscriber,
};

/**
 * POST /v1/webhooks/stripe — public (Stripe calls this with its own
 * signature, not a JWT). See `stripe-webhook.controller.ts` for how the
 * raw request body is preserved for signature verification.
 *
 * Handles `checkout.session.completed` for both Checkout modes we create
 * (`subscription` — plan purchase; `payment` — report purchase),
 * `customer.subscription.updated`/`.deleted` for keeping `Subscription`
 * status in sync, and acknowledges (200, no-op) every other event type
 * without erroring, since Stripe sends many event types this app doesn't
 * act on.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly prisma: PrismaService,
    private readonly reportGeneration: ReportGenerationService,
  ) {}

  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | string[] | undefined,
  ): Promise<{ received: boolean }> {
    if (!rawBody || !signature) {
      throw new BadRequestException("Missing Stripe signature or request body");
    }

    // Both throw a clean 503 if their respective env var is unset — no
    // Stripe account/keys are provisioned yet as of this pass. Checked
    // before signature verification since without both there's nothing
    // valid to verify against.
    const webhookSecret = this.stripeClient.getWebhookSecret();
    const stripe = this.stripeClient.getClient();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException("Invalid Stripe webhook signature");
    }

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, stripe);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.handleSubscriptionStatusSync(event.data.object as Stripe.Subscription);
        break;
      default:
        // Acknowledge, no-op — not every event type Stripe sends is
        // relevant here.
        this.logger.debug(`Ignoring unhandled Stripe webhook event type: ${event.type}`);
        break;
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    stripe: Stripe,
  ): Promise<void> {
    if (session.mode === "subscription") {
      await this.handleSubscriptionCheckoutCompleted(session, stripe);
      return;
    }
    if (session.mode === "payment") {
      await this.handleReportCheckoutCompleted(session);
      return;
    }
    this.logger.warn(`checkout.session.completed for unexpected session mode '${session.mode}' (session ${session.id})`);
  }

  private async handleSubscriptionCheckoutCompleted(
    session: Stripe.Checkout.Session,
    stripe: Stripe,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan;
    if (!userId || !plan) {
      this.logger.error(
        `checkout.session.completed (subscription) missing userId/plan metadata (session ${session.id})`,
      );
      return;
    }

    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) {
      this.logger.error(
        `checkout.session.completed (subscription) has no subscription id (session ${session.id})`,
      );
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = getCurrentPeriodEnd(stripeSubscription);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

    // Upsert keyed on `userId` (unique) — one active subscription per user
    // for v1, per schema.prisma's monetization header comment.
    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: plan as SubscriptionPlan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: "active",
        currentPeriodEnd,
      },
      update: {
        plan: plan as SubscriptionPlan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: "active",
        currentPeriodEnd,
      },
    });

    const externalRole = PLAN_TO_EXTERNAL_ROLE[plan];
    if (externalRole) {
      await this.prisma.user.update({ where: { id: userId }, data: { externalRole } });
    } else {
      this.logger.error(`Unrecognized subscription plan in checkout metadata: '${plan}' (user ${userId})`);
    }
  }

  private async handleReportCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const reportOrderId = session.metadata?.reportOrderId;
    if (!reportOrderId) {
      this.logger.error(
        `checkout.session.completed (payment) missing reportOrderId metadata (session ${session.id})`,
      );
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    // pending_payment -> queued -> generating, per the fulfillment state
    // machine (schema.prisma's monetization header comment). Not user-
    // scoped here: `reportOrderId` came from metadata *we* set when
    // creating this exact Checkout Session, not from client-supplied
    // input, and `event` has already passed Stripe signature verification
    // above.
    const order = await this.prisma.reportOrder.update({
      where: { id: reportOrderId },
      data: { status: "queued", stripePaymentIntentId: paymentIntentId },
    });
    await this.prisma.reportOrder.update({ where: { id: order.id }, data: { status: "generating" } });

    try {
      const content = await this.reportGeneration.generateReportContent(
        order.propertyId,
        order.reportTierCode as ReportTier,
        `report order ${order.id}`,
      );
      await this.prisma.reportOrder.update({
        where: { id: order.id },
        data: { status: "delivered", content: { ...content } },
      });
    } catch (error) {
      // Payment has already succeeded at this point. Do NOT attempt an
      // automatic Stripe refund here — issuing a refund is a real
      // financial action that should go through an actual review process
      // (a future admin/support feature), not be triggered silently by a
      // backend error path. This is flagged explicitly, not swallowed: the
      // order is marked `failed` and logged at `error` level so it's
      // visible for manual follow-up (refund-or-retry decision).
      this.logger.error(
        `Report generation failed for order ${order.id} (property ${order.propertyId}, tier ${order.reportTierCode}) after successful payment — marking failed, NOT issuing a refund: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.reportOrder.update({ where: { id: order.id }, data: { status: "failed" } });
    }
  }

  private async handleSubscriptionStatusSync(subscription: Stripe.Subscription): Promise<void> {
    const status = this.mapStripeStatus(subscription.status);
    if (!status) {
      this.logger.warn(
        `Unmapped Stripe subscription status '${subscription.status}' for subscription ${subscription.id} — leaving local Subscription.status unchanged.`,
      );
      return;
    }

    // Scoped by `stripeSubscriptionId` (unique) — the only key we have
    // linking this Stripe object back to a local row; `updateMany` (not
    // `update`) since it's not the model's primary key.
    const { count } = await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status,
        currentPeriodEnd: getCurrentPeriodEnd(subscription),
      },
    });

    if (count === 0) {
      this.logger.warn(
        `No local Subscription row found for Stripe subscription ${subscription.id} during status sync.`,
      );
    }
  }

  private mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus | null {
    switch (stripeStatus) {
      case "active":
        return "active";
      case "canceled":
      case "unpaid":
        return "canceled";
      case "past_due":
        return "past_due";
      case "incomplete":
      case "incomplete_expired":
      case "trialing":
        return "incomplete";
      case "paused":
        return null;
      default:
        return null;
    }
  }
}

/**
 * `current_period_end` lives on each `SubscriptionItem`, not on the
 * `Subscription` object itself, per the Stripe API version this SDK
 * (stripe-node v22) targets — a real behavior change from older Stripe API
 * versions where it was a top-level `Subscription` field. Every
 * subscription this app creates has exactly one item (one `price_data`
 * line item per Checkout Session — see `SubscriptionsService.createCheckout`),
 * so the first item's period end is *the* period end for our purposes.
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const firstItem = subscription.items.data[0];
  if (!firstItem) {
    return null;
  }
  return new Date(firstItem.current_period_end * 1000);
}
