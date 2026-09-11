import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { StripeClientService } from "./stripe-client.service";
import { SubscriptionsService } from "./subscriptions.service";

const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeCtx(): AccountContext {
  return AccountContext.forUser({ id: USER_ID, orgId: null });
}

describe("SubscriptionsService.createBillingPortalSession", () => {
  let service: SubscriptionsService;

  const billingPortalCreateMock = jest.fn();
  const stripeClientMock = {
    getClient: jest.fn(() => ({
      billingPortal: { sessions: { create: billingPortalCreateMock } },
    })),
  };
  const prismaMock = { subscription: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StripeClientService, useValue: stripeClientMock },
      ],
    }).compile();
    service = moduleRef.get(SubscriptionsService);
  });

  it("rejects with 400 when the user has never subscribed (no Subscription row at all)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);

    await expect(service.createBillingPortalSession(makeCtx())).rejects.toBeInstanceOf(BadRequestException);
    expect(stripeClientMock.getClient).not.toHaveBeenCalled();
  });

  it("rejects with 400 when a Subscription row exists but somehow has no stripeCustomerId", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ stripeCustomerId: null });

    await expect(service.createBillingPortalSession(makeCtx())).rejects.toBeInstanceOf(BadRequestException);
    expect(billingPortalCreateMock).not.toHaveBeenCalled();
  });

  it("creates a portal session scoped to the account's Stripe customer and returns its URL", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_abc123" });
    billingPortalCreateMock.mockResolvedValue({ url: "https://billing.stripe.com/session/test" });

    const result = await service.createBillingPortalSession(makeCtx());

    expect(billingPortalCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_abc123" }),
    );
    expect(result.portalUrl).toBe("https://billing.stripe.com/session/test");
  });
});
