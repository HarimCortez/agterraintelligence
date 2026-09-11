import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AdminBillingService } from "./admin-billing.service";

describe("AdminBillingService", () => {
  let service: AdminBillingService;

  const prismaMock = {
    subscription: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    reportOrder: { groupBy: jest.fn(), aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminBillingService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AdminBillingService);
  });

  describe("getSummary", () => {
    it("computes MRR as the sum of each active plan's catalog price times its count", async () => {
      prismaMock.subscription.groupBy.mockResolvedValue([
        { plan: "basic", _count: { _all: 3 } }, // 3 * 2900 = 8700
        { plan: "investor", _count: { _all: 2 } }, // 2 * 7900 = 15800
        { plan: "professional", _count: { _all: 1 } }, // 1 * 19900 = 19900
      ]);
      prismaMock.reportOrder.groupBy.mockResolvedValue([
        { status: "delivered", _count: { _all: 5 } },
        { status: "failed", _count: { _all: 1 } },
      ]);
      prismaMock.reportOrder.aggregate.mockResolvedValue({ _sum: { pricePaidCents: 24650 } });
      prismaMock.reportOrder.count.mockResolvedValue(6);

      const result = await service.getSummary();

      expect(result.activeSubscriptionsByPlan).toEqual({ basic: 3, investor: 2, professional: 1 });
      expect(result.monthlyRecurringRevenueCents).toBe(8700 + 15800 + 19900);
      expect(result.reportOrdersByStatus).toEqual({ delivered: 5, failed: 1 });
      expect(result.totalReportOrders).toBe(6);
      expect(result.totalReportRevenueCents).toBe(24650);
    });

    it("returns zero revenue (not null/undefined) when there are no delivered orders yet", async () => {
      prismaMock.subscription.groupBy.mockResolvedValue([]);
      prismaMock.reportOrder.groupBy.mockResolvedValue([]);
      prismaMock.reportOrder.aggregate.mockResolvedValue({ _sum: { pricePaidCents: null } });
      prismaMock.reportOrder.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result.totalReportRevenueCents).toBe(0);
      expect(result.activeSubscriptionsByPlan).toEqual({});
      expect(result.monthlyRecurringRevenueCents).toBe(0);
    });
  });

  describe("listSubscriptions", () => {
    it("flattens the joined user email onto each row and passes through pagination", async () => {
      prismaMock.subscription.findMany.mockResolvedValue([
        {
          id: "sub-1",
          userId: "user-1",
          user: { email: "investor@example.com" },
          plan: "investor",
          status: "active",
          currentPeriodEnd: null,
          stripeCustomerId: "cus_1",
          createdAt: new Date("2026-01-01"),
        },
      ]);
      prismaMock.subscription.count.mockResolvedValue(1);

      const result = await service.listSubscriptions({ limit: 10, offset: 0 });

      expect(result.results[0]).toMatchObject({ id: "sub-1", userEmail: "investor@example.com", plan: "investor" });
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it("filters by plan and status when provided", async () => {
      prismaMock.subscription.findMany.mockResolvedValue([]);
      prismaMock.subscription.count.mockResolvedValue(0);

      await service.listSubscriptions({ plan: "basic", status: "canceled", limit: 50, offset: 0 });

      expect(prismaMock.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { plan: "basic", status: "canceled" } }),
      );
    });
  });

  describe("listReportOrders", () => {
    it("flattens the joined user email and property address onto each row", async () => {
      prismaMock.reportOrder.findMany.mockResolvedValue([
        {
          id: "order-1",
          userId: "user-1",
          user: { email: "buyer@example.com" },
          propertyId: "prop-1",
          property: { address: "Arcadia Citrus Grove Estate" },
          reportTierCode: "essential",
          pricePaidCents: 4900,
          priceBasis: "subscriber",
          upgradeCreditAppliedCents: 0,
          status: "delivered",
          createdAt: new Date("2026-01-01"),
        },
      ]);
      prismaMock.reportOrder.count.mockResolvedValue(1);

      const result = await service.listReportOrders({ limit: 50, offset: 0 });

      expect(result.results[0]).toMatchObject({
        userEmail: "buyer@example.com",
        propertyAddress: "Arcadia Citrus Grove Estate",
        reportTierCode: "essential",
      });
    });
  });
});
