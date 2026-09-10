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

function makeCheckoutSessionCompletedEvent(session: Partial<Stripe.Checkout.Session>): string {
  return JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", object: "checkout.session", ...session } },
  });
}

describe("StripeWebhookService — signature verification", () => {
  let service: StripeWebhookService;

  const prismaMock = {
    subscription: { upsert: jest.fn(), updateMany: jest.fn() },
    user: { update: jest.fn() },
    reportOrder: { update: jest.fn() },
  };
  const reportGenerationMock = { generateReportContent: jest.fn() };

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

  it("on report generation failure after successful payment: marks the order failed and does NOT throw or refund", async () => {
    service = await build(makeConfig());
    prismaMock.reportOrder.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "order-1",
        propertyId: "prop-1",
        reportTierCode: "essential",
        ...data,
      }),
    );
    reportGenerationMock.generateReportContent.mockRejectedValue(new Error("model unavailable"));

    const payload = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      metadata: { reportOrderId: "order-1" },
      payment_intent: "pi_test_1",
    });
    const signature = signPayload(payload);

    const result = await service.handleWebhook(Buffer.from(payload), signature);

    expect(result).toEqual({ received: true });
    // queued -> generating -> failed: at least the final call must mark `failed`.
    const statuses = prismaMock.reportOrder.update.mock.calls.map((call) => call[0].data.status);
    expect(statuses).toContain("failed");
    expect(statuses[statuses.length - 1]).toBe("failed");
  });
});
