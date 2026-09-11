import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AdminRevenueService } from "./admin-revenue.service";

describe("AdminRevenueService", () => {
  let service: AdminRevenueService;

  const prismaMock = {
    subscription: { groupBy: jest.fn(), findMany: jest.fn() },
    reportOrder: { groupBy: jest.fn(), findMany: jest.fn() },
    reportTier: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminRevenueService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AdminRevenueService);
  });

  describe("getSummary", () => {
    it("computes MRR, per-tier revenue (joined with display names), and per-persona breakdowns", async () => {
      prismaMock.subscription.groupBy.mockResolvedValue([{ plan: "investor", _count: { _all: 2 } }]); // 2 * 7900
      prismaMock.reportOrder.groupBy.mockResolvedValue([
        { reportTierCode: "essential", _count: { _all: 3 }, _sum: { pricePaidCents: 14700 } },
      ]);
      prismaMock.reportTier.findMany.mockResolvedValue([{ code: "essential", displayName: "Essential" }]);
      prismaMock.subscription.findMany.mockResolvedValue([
        { user: { externalRole: "investor_subscriber" } },
        { user: { externalRole: "investor_subscriber" } },
      ]);
      prismaMock.reportOrder.findMany.mockResolvedValue([
        { pricePaidCents: 4900, user: { externalRole: "free" } },
        { pricePaidCents: 9800, user: { externalRole: "investor_subscriber" } },
      ]);

      const result = await service.getSummary();

      expect(result.subscriptionMrrCents).toBe(15800);
      expect(result.reportRevenueCents).toBe(14700);
      expect(result.revenueByTier).toEqual([
        { reportTierCode: "essential", displayName: "Essential", orderCount: 3, revenueCents: 14700 },
      ]);

      const freeRow = result.revenueByPersona.find((r) => r.externalRole === "free")!;
      expect(freeRow).toMatchObject({ activeSubscriptionCount: 0, reportOrderCount: 1, reportRevenueCents: 4900 });
      const investorRow = result.revenueByPersona.find((r) => r.externalRole === "investor_subscriber")!;
      expect(investorRow).toMatchObject({
        activeSubscriptionCount: 2,
        reportOrderCount: 1,
        reportRevenueCents: 9800,
      });
      // Every ExternalRole value is represented (zero-filled), not just roles with real data.
      expect(result.revenueByPersona).toHaveLength(7);
    });
  });

  describe("getTrend", () => {
    it("zero-fills every day in the range and only adds revenue/signups to the matching UTC day bucket", async () => {
      // Anchor relative to "now" (like the service itself does), not a
      // hardcoded absolute date — this test must keep passing regardless
      // of what day it actually runs on.
      const threeDaysAgo = new Date();
      threeDaysAgo.setUTCHours(12, 0, 0, 0);
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
      const targetDateKey = threeDaysAgo.toISOString().slice(0, 10);

      prismaMock.reportOrder.findMany.mockResolvedValue([{ createdAt: threeDaysAgo, pricePaidCents: 4900 }]);
      prismaMock.subscription.findMany.mockResolvedValue([{ createdAt: threeDaysAgo }]);

      const result = await service.getTrend({ days: 7 });

      expect(result.points).toHaveLength(7);
      const targetDay = result.points.find((p) => p.date === targetDateKey);
      expect(targetDay).toEqual({ date: targetDateKey, reportRevenueCents: 4900, newSubscriptions: 1 });
      const otherDays = result.points.filter((p) => p.date !== targetDateKey);
      expect(otherDays.every((p) => p.reportRevenueCents === 0 && p.newSubscriptions === 0)).toBe(true);
    });
  });

  describe("getTopTransactions", () => {
    it("returns delivered orders sorted by price paid, flattening user email and property address", async () => {
      prismaMock.reportOrder.findMany.mockResolvedValue([
        {
          id: "order-1",
          user: { email: "big-spender@example.com" },
          property: { address: "Big Grove" },
          reportTierCode: "professional",
          pricePaidCents: 24900,
          createdAt: new Date("2026-01-01"),
        },
      ]);

      const result = await service.getTopTransactions({ limit: 10 });

      expect(prismaMock.reportOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "delivered" }, orderBy: { pricePaidCents: "desc" }, take: 10 }),
      );
      expect(result.results[0]).toMatchObject({
        orderId: "order-1",
        userEmail: "big-spender@example.com",
        propertyAddress: "Big Grove",
        pricePaidCents: 24900,
      });
    });
  });
});
