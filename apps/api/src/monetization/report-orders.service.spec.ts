import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { PropertiesService } from "../properties/properties.service";
import { StripeClientService } from "./stripe-client.service";
import { ReportOrdersService } from "./report-orders.service";

const PROPERTY_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

// Mirrors prisma/seed.ts's four confirmed launch-price ReportTier rows.
const TIERS = {
  essential: {
    code: "essential",
    displayName: "Essential",
    subscriberPriceCents: 4900,
    nonSubscriberPriceCents: 7350,
    requiresHumanReview: false,
    sortOrder: 1,
  },
  investor: {
    code: "investor",
    displayName: "Investor",
    subscriberPriceCents: 9900,
    nonSubscriberPriceCents: 14850,
    requiresHumanReview: false,
    sortOrder: 2,
  },
  professional: {
    code: "professional",
    displayName: "Professional",
    subscriberPriceCents: 24900,
    nonSubscriberPriceCents: 37350,
    requiresHumanReview: false,
    sortOrder: 3,
  },
  premium: {
    code: "premium",
    displayName: "Premium Intelligence",
    subscriberPriceCents: 49900,
    nonSubscriberPriceCents: 74850,
    requiresHumanReview: true,
    sortOrder: 4,
  },
};
const ALL_TIERS = Object.values(TIERS);

function makeCtx(): AccountContext {
  return AccountContext.forUser({ id: USER_ID, orgId: null });
}

function makeDeliveredOrder(overrides: Partial<{ reportTierCode: string; pricePaidCents: number }> = {}) {
  return {
    id: "order-" + Math.random().toString(36).slice(2),
    userId: USER_ID,
    propertyId: PROPERTY_ID,
    reportTierCode: "essential",
    pricePaidCents: 7350,
    priceBasis: "non_subscriber",
    upgradeCreditAppliedCents: 0,
    status: "delivered",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    content: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("ReportOrdersService — upgrade-credit / entitlement logic", () => {
  let service: ReportOrdersService;

  const propertiesServiceMock = { getPropertyById: jest.fn() };
  const checkoutSessionsCreateMock = jest.fn();
  const stripeClientMock = {
    getClient: jest.fn(() => ({
      checkout: { sessions: { create: checkoutSessionsCreateMock } },
    })),
  };

  const prismaMock = {
    reportTier: { findUnique: jest.fn(), findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
    reportOrder: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    propertiesServiceMock.getPropertyById.mockResolvedValue({ id: PROPERTY_ID });
    prismaMock.reportTier.findMany.mockResolvedValue(ALL_TIERS);
    checkoutSessionsCreateMock.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
    prismaMock.reportOrder.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "new-order-id", ...data }),
    );
    prismaMock.reportOrder.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "new-order-id", ...data }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportOrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PropertiesService, useValue: propertiesServiceMock },
        { provide: StripeClientService, useValue: stripeClientMock },
      ],
    }).compile();
    service = moduleRef.get(ReportOrdersService);
  });

  it("propagates NotFoundException when the property doesn't exist, without touching Stripe or creating an order", async () => {
    propertiesServiceMock.getPropertyById.mockRejectedValue(new NotFoundException("not found"));

    await expect(service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(stripeClientMock.getClient).not.toHaveBeenCalled();
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });

  it("rejects `premium` with the specific 'not yet available for purchase' 400, not a generic error", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.premium);

    await expect(service.createCheckout(makeCtx(), PROPERTY_ID, "premium", "buyer@example.com")).rejects.toMatchObject({
      response: { statusCode: 400, message: "Premium reports are not yet available for purchase" },
    });
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });

  it("no prior order + non-subscriber: charges the full non-subscriber price with zero credit", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue(null); // no subscription -> non-subscriber pricing
    prismaMock.reportOrder.findMany.mockResolvedValue([]); // no delivered orders

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com");

    expect(result.priceCents).toBe(TIERS.essential.nonSubscriberPriceCents);
    expect(result.upgradeCreditAppliedCents).toBe(0);
    expect(prismaMock.reportOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        propertyId: PROPERTY_ID,
        reportTierCode: "essential",
        pricePaidCents: TIERS.essential.nonSubscriberPriceCents,
        priceBasis: "non_subscriber",
        upgradeCreditAppliedCents: 0,
        status: "pending_payment",
      }),
    });
  });

  it("no prior order + active subscriber: charges the subscriber price", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "active" });
    prismaMock.reportOrder.findMany.mockResolvedValue([]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com");

    expect(result.priceCents).toBe(TIERS.essential.subscriberPriceCents);
    expect(result.upgradeCreditAppliedCents).toBe(0);
  });

  it("a canceled/past_due subscription does NOT get subscriber pricing (only `active` counts)", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "canceled" });
    prismaMock.reportOrder.findMany.mockResolvedValue([]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com");

    expect(result.priceCents).toBe(TIERS.essential.nonSubscriberPriceCents);
  });

  it("a lower delivered tier exists: applies its pricePaidCents as credit against the new tier's price", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.investor);
    prismaMock.subscription.findUnique.mockResolvedValue(null); // non-subscriber: investor = 14850
    prismaMock.reportOrder.findMany.mockResolvedValue([
      makeDeliveredOrder({ reportTierCode: "essential", pricePaidCents: 7350 }),
    ]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "investor", "buyer@example.com");

    expect(result.upgradeCreditAppliedCents).toBe(7350);
    expect(result.priceCents).toBe(14850 - 7350);
    expect(prismaMock.reportOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ pricePaidCents: 14850 - 7350, upgradeCreditAppliedCents: 7350 }),
    });
  });

  it("picks the HIGHEST lower-tier delivered order as the credit source when multiple exist", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.professional);
    prismaMock.subscription.findUnique.mockResolvedValue(null); // professional non-subscriber = 37350
    prismaMock.reportOrder.findMany.mockResolvedValue([
      makeDeliveredOrder({ reportTierCode: "essential", pricePaidCents: 7350 }),
      makeDeliveredOrder({ reportTierCode: "investor", pricePaidCents: 14850 }),
    ]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "professional", "buyer@example.com");

    // Credit must come from the investor order (14850), not the essential one (7350).
    expect(result.upgradeCreditAppliedCents).toBe(14850);
    expect(result.priceCents).toBe(37350 - 14850);
  });

  it("floors the final price at 0 (and the applied credit at the tier's own price) when the prior payment exceeds the new tier's price", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.investor);
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "active" }); // subscriber investor price = 9900
    // Prior essential order paid at an inflated non-subscriber price higher than the new tier's subscriber price.
    prismaMock.reportOrder.findMany.mockResolvedValue([
      makeDeliveredOrder({ reportTierCode: "essential", pricePaidCents: 20000 }),
    ]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "investor", "buyer@example.com");

    expect(result.priceCents).toBe(0);
    expect(result.upgradeCreditAppliedCents).toBe(9900); // capped at the new tier's own price, not the full 20000
    expect(result.upgradeCreditAppliedCents).toBeGreaterThanOrEqual(0);
    expect(result.priceCents).toBeGreaterThanOrEqual(0);
  });

  it("rejects with 409 when the user already has a delivered order at this tier", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.investor);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.reportOrder.findMany.mockResolvedValue([
      makeDeliveredOrder({ reportTierCode: "investor", pricePaidCents: 14850 }),
    ]);

    await expect(service.createCheckout(makeCtx(), PROPERTY_ID, "investor", "buyer@example.com")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the user already has a delivered order at a HIGHER tier", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.reportOrder.findMany.mockResolvedValue([
      makeDeliveredOrder({ reportTierCode: "professional", pricePaidCents: 37350 }),
    ]);

    await expect(service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });

  it("non-delivered orders (e.g. failed, pending_payment) at the same tier do NOT block a repurchase", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    // Scoped query only returns status: "delivered" orders — simulate that by returning none.
    prismaMock.reportOrder.findMany.mockResolvedValue([]);

    const result = await service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com");
    expect(result.priceCents).toBe(TIERS.essential.nonSubscriberPriceCents);
  });

  it("returns a clean 503 when Stripe isn't configured, and never creates a ReportOrder row", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(TIERS.essential);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.reportOrder.findMany.mockResolvedValue([]);
    stripeClientMock.getClient.mockImplementationOnce(() => {
      throw new ServiceUnavailableException("Payments are not currently configured. Please try again later.");
    });

    await expect(service.createCheckout(makeCtx(), PROPERTY_ID, "essential", "buyer@example.com")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });

  it("rejects unknown/malformed tier codes defensively with a 400", async () => {
    prismaMock.reportTier.findUnique.mockResolvedValue(null);

    await expect(
      // Cast bypasses the DTO's compile-time `ReportTierCode` union — this
      // simulates the tier row having been removed/renamed out from under
      // an otherwise-valid-looking request.
      service.createCheckout(makeCtx(), PROPERTY_ID, "nonexistent-tier" as never, "buyer@example.com"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.reportOrder.create).not.toHaveBeenCalled();
  });
});
