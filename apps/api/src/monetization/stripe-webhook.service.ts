import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { ExternalRole, SubscriptionPlan, SubscriptionStatus } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
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
 * `checkout.session.async_payment_succeeded`/`.async_payment_failed` for
 * delayed-notification payment methods (e.g. bank debits — Checkout Sessions
 * here intentionally omit `payment_method_types` to allow Stripe's dynamic
 * payment methods, so `completed` can fire before payment actually clears),
 * `customer.subscription.updated`/`.deleted` and `invoice.paid`/
 * `.payment_failed` for keeping `Subscription` status in sync, and
 * acknowledges (200, no-op) every other event type without erroring, since
 * Stripe sends many event types this app doesn't act on.
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Dynamic payment methods are enabled (Checkout Sessions omit
        // `payment_method_types` by design — do not change that), so this
        // event can fire for a delayed-notification payment method (e.g. a
        // bank debit) while `session.payment_status` is still `"unpaid"`.
        // The real outcome arrives later via a separate
        // `async_payment_succeeded`/`async_payment_failed` event — defer
        // fulfillment rather than fulfilling (or not) based on this event
        // alone. `"paid"` and `"no_payment_required"` (e.g. a subscription
        // trial with no immediate charge) both mean the payment is settled
        // now, so those proceed exactly as before.
        if (session.payment_status === "unpaid") {
          this.logger.log(
            `checkout.session.completed (session ${session.id}, mode ${session.mode}) has payment_status 'unpaid' — deferring fulfillment pending async_payment_succeeded/async_payment_failed.`,
          );
          break;
        }
        await this.handleCheckoutSessionCompleted(session, stripe);
        break;
      }
      case "checkout.session.async_payment_succeeded":
        // This event only fires on confirmed success — no payment_status
        // check needed, route straight to the same mode-specific
        // fulfillment logic as `completed`.
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, stripe);
        break;
      case "checkout.session.async_payment_failed":
        await this.handleCheckoutSessionAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.handleSubscriptionStatusSync(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
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

    // Idempotency guard: Stripe can redeliver `checkout.session.completed`/
    // `async_payment_succeeded` for the same event (or, in principle, both
    // could reach us for the same order in a delayed-payment-method flow).
    // Scoped conditional update — only transition pending_payment -> queued;
    // if the order has already moved past pending_payment (a prior delivery
    // of this same event already started/finished fulfillment), skip
    // re-running the report-generation/AI-call side effect rather than
    // blindly re-fulfilling. Not user-scoped beyond that: `reportOrderId`
    // came from metadata *we* set when creating this exact Checkout Session,
    // not from client-supplied input, and `event` has already passed Stripe
    // signature verification above.
    const { count } = await this.prisma.reportOrder.updateMany({
      where: { id: reportOrderId, status: "pending_payment" },
      data: { status: "queued", stripePaymentIntentId: paymentIntentId },
    });
    if (count === 0) {
      this.logger.log(
        `Report order ${reportOrderId} (session ${session.id}) is already past pending_payment — skipping duplicate fulfillment (webhook redelivery).`,
      );
      return;
    }

    // pending_payment -> queued -> generating -> delivered/failed. The
    // generating..terminal-state portion is shared with
    // AdminReportFulfillmentService's retry action — see
    // ReportGenerationService.runGeneration's doc comment.
    await this.reportGeneration.runGeneration(reportOrderId);
  }

  private async handleCheckoutSessionAsyncPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode === "payment") {
      const reportOrderId = session.metadata?.reportOrderId;
      if (!reportOrderId) {
        this.logger.error(
          `checkout.session.async_payment_failed (payment) missing reportOrderId metadata (session ${session.id})`,
        );
        return;
      }

      // Scoped conditional update: only fail an order still awaiting
      // payment confirmation — never overwrite an order that already
      // progressed (e.g. delivered/failed via a separate, already-processed
      // delivery of this same purchase).
      const { count } = await this.prisma.reportOrder.updateMany({
        where: { id: reportOrderId, status: "pending_payment" },
        data: { status: "failed" },
      });
      if (count === 0) {
        this.logger.warn(
          `checkout.session.async_payment_failed for report order ${reportOrderId} (session ${session.id}) — order was not in pending_payment (already progressed or not found), leaving unchanged.`,
        );
      } else {
        this.logger.warn(
          `checkout.session.async_payment_failed — marked report order ${reportOrderId} (session ${session.id}) as failed (delayed-notification payment method did not clear).`,
        );
      }
      return;
    }

    if (session.mode === "subscription") {
      // No local Subscription row exists yet at this point in the flow —
      // it's only created in `handleSubscriptionCheckoutCompleted`, which
      // never ran for this session since payment never actually cleared.
      // Nothing to update; logged clearly for manual/support follow-up.
      const email = session.customer_details?.email ?? session.customer_email ?? "unknown";
      this.logger.warn(
        `checkout.session.async_payment_failed for a subscription checkout (session ${session.id}, customer email ${email}) — delayed-notification payment method did not clear; no local Subscription row exists to update.`,
      );
      return;
    }

    this.logger.warn(
      `checkout.session.async_payment_failed for unexpected session mode '${session.mode}' (session ${session.id})`,
    );
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      this.logger.debug(`invoice.paid for invoice ${invoice.id} with no associated subscription — no-op.`);
      return;
    }

    // `customer.subscription.updated` already keeps `status`/
    // `currentPeriodEnd` in sync for the ongoing cases that matter. This
    // handler exists so a successful renewal charge is visible in logs
    // (Stripe's own guidance: don't consider a subscription integration
    // complete without handling invoice events) — no additional local state
    // update beyond what subscription status sync already does. If a
    // concrete state change beyond logging turns out to be needed here,
    // that should be flagged/designed rather than added ad hoc — no new
    // schema/fields added in this pass.
    this.logger.log(`invoice.paid for subscription ${subscriptionId} (invoice ${invoice.id}) — renewal payment succeeded.`);
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      this.logger.warn(`invoice.payment_failed for invoice ${invoice.id} with no associated subscription — no-op.`);
      return;
    }

    // Scoped by `stripeSubscriptionId` (unique) — same `updateMany` pattern
    // as `handleSubscriptionStatusSync`, since it's not the model's primary
    // key.
    const { count } = await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "past_due" },
    });
    if (count === 0) {
      this.logger.warn(
        `invoice.payment_failed for Stripe subscription ${subscriptionId} (invoice ${invoice.id}) — no local Subscription row found.`,
      );
    } else {
      this.logger.warn(
        `invoice.payment_failed — marked local Subscription for Stripe subscription ${subscriptionId} (invoice ${invoice.id}) as past_due.`,
      );
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

/**
 * As of the pinned Stripe API version (`2026-08-26.dahlia`), an `Invoice`
 * no longer carries a top-level `subscription` field — it moved to
 * `invoice.parent.subscription_details.subscription` (the "invoice
 * rendering"/parent-object restructuring). This app only ever needs the
 * bare id, never the expanded `Subscription` object.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
}
