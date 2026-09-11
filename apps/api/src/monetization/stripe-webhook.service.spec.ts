import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import Stripe from "stripe";
import { PrismaService } from "../common/prisma/prisma.service";
import { StripeClientService } from "./stripe-client.service";
import { ReportGenerationService } from "./report-generation.service";
import { StripeWebhookService } from "./stripe-webhook.service";

const WEBHOOK_SECRET = "whsec_test_secret_abc123";

/**
 * A real `Stripe` instance used only to *sign* test payloads
 * (`webhooks.generateTestHeaderString`) — the SDK's own documented test
 * utility for this, not a hand-rolled HMAC. No network call is made by
 * signing; `new Stripe(...)` only requires a syntactically-present key.
 */
const signer = new Stripe("sk_test_dummy_signing_key_only");

function signPayload(payload: string, secret: string = WEBHOOK_SECRET): string {
  return signer.webhooks.generateTestHeaderString({ payload, secret });
}

function makeCheckoutSessionEvent(
  type: "checkout.session.completed" | "checkout.session.async_payment_succeeded" | "checkout.session.async_payment_failed",
  session: Partial<Stripe.Checkout.Session>,
  eventId = "evt_test_1",
): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type,
    data: { object: { id: "cs_test_1", object: "checkout.session", ...session } },
  });
}

function makeCheckoutSessionCompletedEvent(session: Partial<Stripe.Checkout.Session>): string {
  return makeCheckoutSessionEvent("checkout.session.completed", session);
}

/**
 * As of the pinned Stripe API version (`2026-08-26.dahlia`), an `Invoice`'s
 * subscription id lives at `invoice.parent.subscription_details.subscription`,
 * not a top-level `subscription` field — see `getInvoiceSubscriptionId` in
 * `stripe-webhook.service.ts`.
 */
function makeInvoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  { subscriptionId }: { subscriptionId?: string } = {},
): string {
  return JSON.stringify({
    id: "evt_test_invoice_1",
    object: "event",
    type,
    data: {
      object: {
        id: "in_test_1",
        object: "invoice",
        parent: subscriptionId
          ? { type: "subscription_details", subscription_details: { subscription: subscriptionId } }
          : null,
      },
    },
  });
}

describe("StripeWebhookService — signature verification", () => {
  let service: StripeWebhookService;

  const prismaMock = {
    subscription: { upsert: jest.fn(), updateMany: jest.fn() },
    user: { update: jest.fn() },
    reportOrder: { update: jest.fn(), updateMany: jest.fn() },
  };
  const reportGenerationMock = { generateReportContent: jest.fn(), runGeneration: jest.fn() };

  function makeConfig(overrides: Record<string, string> = {}) {
    return {
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ...overrides,
    };
  }

  async function build(env: Record<string, string>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        {
          provide: StripeClientService,
          useValue: {
            getClient: () => {
              if (!env.STRIPE_SECRET_KEY) {
                throw new ServiceUnavailableException("Payments are not currently configured.");
              }
              return new Stripe(env.STRIPE_SECRET_KEY);
            },
            getWebhookSecret: () => {
              if (!env.STRIPE_WEBHOOK_SECRET) {
                throw new ServiceUnavailableException("Webhook processing is not currently configured.");
              }
              return env.STRIPE_WEBHOOK_SECRET;
            },
          },
        },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReportGenerationService, useValue: reportGenerationMock },
      ],
    }).compile();
    return moduleRef.get(StripeWebhookService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: the report-order idempotency guard (and the async-payment-
    // failed conditional update) both scope on `status: "pending_payment"`
    // — default to "found one row, proceeded" so existing tests that don't
    // care about the guard keep working; individual tests override this
    // with `mockResolvedValueOnce({ count: 0 })` to exercise the
    // already-handled / already-progressed branches.
    prismaMock.reportOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rejects a missing signature/body with a 400 before attempting verification", async () => {
    service = await build(makeConfig());
    await expect(service.handleWebhook(Buffer.from("{}"), undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handleWebhook(undefined, "sig")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns a clean 503 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    service = await build(makeConfig({ STRIPE_WEBHOOK_SECRET: "" }));
    const payload = makeCheckoutSessionCompletedEvent({ mode: "payment" });
    const signature = signPayload(payload);

    await expect(service.handleWebhook(Buffer.from(payload), signature)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("accepts a genuinely validly-signed payload (real Stripe SDK signing + verification, no faked signature)", async () => {
    service = await build(makeConfig());
    const payload = JSON.stringify({
      id: "evt_test_ignored_type",
      object: "event",
      type: "some.irrelevant.event.type",
      data: { object: {} },
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);
    expect(result).toEqual({ received: true });
  });

  it("rejects a payload whose signature was computed with the WRONG secret, with a 400", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionCompletedEvent({ mode: "payment" });
    const signature = signPayload(payload, "whsec_completely_different_secret");

    await expect(service.handleWebhook(Buffer.from(payload), signature)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a payload that was tampered with after signing, with a 400", async () => {
    service = await build(makeConfig());
    const originalPayload = makeCheckoutSessionCompletedEvent({ mode: "payment" });
    const signature = signPayload(originalPayload);
    const tamperedPayload = originalPayload.replace("cs_test_1", "cs_test_ATTACKER_MODIFIED");

    await expect(service.handleWebhook(Buffer.from(tamperedPayload), signature)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a garbage/non-Stripe-format signature header with a 400", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionCompletedEvent({ mode: "payment" });

    await expect(service.handleWebhook(Buffer.from(payload), "not-a-real-signature-header")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("acknowledges (200, no-op) an unhandled event type without erroring or touching Prisma", async () => {
    service = await build(makeConfig());
    const payload = JSON.stringify({
      id: "evt_test_2",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_test_1" } },
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);
    expect(result).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
  });

  it("on a valid `checkout.session.completed` (payment mode) with missing reportOrderId metadata: logs and does not throw", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionCompletedEvent({ mode: "payment", metadata: {} });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);
    expect(result).toEqual({ received: true });
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
  });

  it("on checkout.session.completed (payment mode) with a valid reportOrderId: runs the idempotency-guarded transition then delegates fulfillment to ReportGenerationService.runGeneration", async () => {
    service = await build(makeConfig());

    const payload = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      metadata: { reportOrderId: "order-1" },
      payment_intent: "pi_test_1",
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.reportOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "pending_payment" },
      data: { status: "queued", stripePaymentIntentId: "pi_test_1" },
    });
    // The generating -> delivered/failed status machine (including the
    // "no automatic refund on failure" behavior) now lives entirely in
    // ReportGenerationService.runGeneration — see its own spec file.
    // Here we only need to confirm the webhook actually delegates to it.
    expect(reportGenerationMock.runGeneration).toHaveBeenCalledWith("order-1");
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
  });

  it("on `checkout.session.completed` with payment_status 'unpaid' (delayed-notification payment method): defers fulfillment entirely", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      payment_status: "unpaid",
      metadata: { reportOrderId: "order-unpaid" },
      payment_intent: "pi_test_unpaid",
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.reportOrder.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
    expect(reportGenerationMock.runGeneration).not.toHaveBeenCalled();
  });

  it("on `checkout.session.async_payment_succeeded` (payment mode): fulfills the report order same as a direct `completed`", async () => {
    service = await build(makeConfig());

    const payload = makeCheckoutSessionEvent("checkout.session.async_payment_succeeded", {
      mode: "payment",
      metadata: { reportOrderId: "order-async-ok" },
      payment_intent: "pi_test_async_ok",
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.reportOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-async-ok", status: "pending_payment" },
      data: { status: "queued", stripePaymentIntentId: "pi_test_async_ok" },
    });
    expect(reportGenerationMock.runGeneration).toHaveBeenCalledWith("order-async-ok");
  });

  it("on `checkout.session.async_payment_failed` (payment mode): marks a still-pending report order failed via a scoped conditional update", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionEvent("checkout.session.async_payment_failed", {
      mode: "payment",
      metadata: { reportOrderId: "order-async-fail" },
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.reportOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-async-fail", status: "pending_payment" },
      data: { status: "failed" },
    });
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
  });

  it("on `checkout.session.async_payment_failed`: does NOT touch a report order that's already progressed past pending_payment (e.g. already delivered)", async () => {
    service = await build(makeConfig());
    prismaMock.reportOrder.updateMany.mockResolvedValueOnce({ count: 0 });

    const payload = makeCheckoutSessionEvent("checkout.session.async_payment_failed", {
      mode: "payment",
      metadata: { reportOrderId: "order-already-delivered" },
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    // Scoped where-clause (status: pending_payment) is what actually
    // prevents a real DB row that's already `delivered` from matching —
    // the mock's `count: 0` return stands in for that non-match.
    expect(prismaMock.reportOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-already-delivered", status: "pending_payment" },
      data: { status: "failed" },
    });
    expect(prismaMock.reportOrder.update).not.toHaveBeenCalled();
  });

  it("on `checkout.session.async_payment_failed` (subscription mode): logs, touches no Prisma models (no local Subscription row yet)", async () => {
    service = await build(makeConfig());
    const payload = makeCheckoutSessionEvent("checkout.session.async_payment_failed", {
      mode: "subscription",
      customer_details: { email: "investor@example.com" } as Stripe.Checkout.Session.CustomerDetails,
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("idempotency guard: processing the same report-purchase fulfillment event twice only generates the report once", async () => {
    service = await build(makeConfig());
    prismaMock.reportOrder.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const payload = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      metadata: { reportOrderId: "order-redelivered" },
      payment_intent: "pi_test_redelivered",
    });
    const signature = signPayload(payload);

    const first = await service.handleWebhook(Buffer.from(payload), signature);
    const second = await service.handleWebhook(Buffer.from(payload), signature);

    expect(first).toEqual({ received: true });
    expect(second).toEqual({ received: true });
    // First delivery: guard passes (count: 1) -> generation runs once.
    // Second (redelivered) event: guard fails (count: 0, order already past
    // pending_payment) -> generation must NOT run again.
    expect(reportGenerationMock.runGeneration).toHaveBeenCalledTimes(1);
    expect(prismaMock.reportOrder.updateMany).toHaveBeenCalledTimes(2);
  });

  it("on `invoice.payment_failed`: marks the matching local Subscription 'past_due'", async () => {
    service = await build(makeConfig());
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });

    const payload = makeInvoiceEvent("invoice.payment_failed", { subscriptionId: "sub_test_1" });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_test_1" },
      data: { status: "past_due" },
    });
  });

  it("on `invoice.payment_failed` with no matching local Subscription row: logs and does not throw", async () => {
    service = await build(makeConfig());
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

    const payload = makeInvoiceEvent("invoice.payment_failed", { subscriptionId: "sub_unknown" });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);
    expect(result).toEqual({ received: true });
  });

  it("on `invoice.paid`: acknowledges without throwing or touching Prisma (logging-only for this pass)", async () => {
    service = await build(makeConfig());
    const payload = makeInvoiceEvent("invoice.paid", { subscriptionId: "sub_test_1" });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
  });
});
