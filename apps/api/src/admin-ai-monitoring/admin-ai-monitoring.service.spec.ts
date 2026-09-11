import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AdminAiMonitoringService } from "./admin-ai-monitoring.service";

describe("AdminAiMonitoringService", () => {
  let service: AdminAiMonitoringService;

  const prismaMock = {
    aiCallLog: { groupBy: jest.fn(), aggregate: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };

  async function build(configValues: Record<string, string> = {}) {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAiMonitoringService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: new ConfigService(configValues) },
      ],
    }).compile();
    return moduleRef.get(AdminAiMonitoringService);
  }

  describe("getSummary", () => {
    it("returns null (not 0 or 100) for successRatePct and averageResponseMs when there have been no calls", async () => {
      service = await build();
      prismaMock.aiCallLog.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prismaMock.aiCallLog.aggregate.mockResolvedValue({ _avg: { durationMs: null } });

      const result = await service.getSummary();

      expect(result.totalCalls).toBe(0);
      expect(result.successRatePct).toBeNull();
      expect(result.averageResponseMs).toBeNull();
    });

    it("computes success rate and rounds average response time from real grouped data", async () => {
      service = await build({ ANTHROPIC_API_KEY: "sk-test" });
      prismaMock.aiCallLog.groupBy
        .mockResolvedValueOnce([
          { status: "succeeded", _count: { _all: 8 } },
          { status: "failed", _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([
          { feature: "ai_analyst", _count: { _all: 7 } },
          { feature: "report_generation", _count: { _all: 3 } },
        ]);
      prismaMock.aiCallLog.aggregate.mockResolvedValue({ _avg: { durationMs: 1234.6 } });

      const result = await service.getSummary();

      expect(result.totalCalls).toBe(10);
      expect(result.successRatePct).toBe(80);
      expect(result.averageResponseMs).toBe(1235);
      expect(result.callsByFeature).toEqual({ ai_analyst: 7, report_generation: 3 });
      expect(result.modelConfigured).toBe(true);
    });

    it("reports modelConfigured false when ANTHROPIC_API_KEY is not set", async () => {
      service = await build({});
      prismaMock.aiCallLog.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prismaMock.aiCallLog.aggregate.mockResolvedValue({ _avg: { durationMs: null } });

      const result = await service.getSummary();

      expect(result.modelConfigured).toBe(false);
    });
  });

  describe("getTrend", () => {
    it("zero-fills every day in the window, not just days with real calls", async () => {
      service = await build();
      prismaMock.aiCallLog.findMany.mockResolvedValue([]);

      const result = await service.getTrend({ days: 5 });

      expect(result.points).toHaveLength(5);
      expect(result.points.every((p) => p.succeeded === 0 && p.failed === 0)).toBe(true);
    });

    it("buckets real calls into their UTC day and separates succeeded from failed", async () => {
      service = await build();
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      prismaMock.aiCallLog.findMany.mockResolvedValue([
        { createdAt: today, status: "succeeded" },
        { createdAt: today, status: "succeeded" },
        { createdAt: today, status: "failed" },
      ]);

      const result = await service.getTrend({ days: 3 });

      const todayBucket = result.points[result.points.length - 1]!;
      expect(todayBucket.succeeded).toBe(2);
      expect(todayBucket.failed).toBe(1);
    });
  });

  describe("listCalls", () => {
    it("filters by both status and feature when both are provided", async () => {
      service = await build();
      prismaMock.aiCallLog.findMany.mockResolvedValue([]);
      prismaMock.aiCallLog.count.mockResolvedValue(0);

      await service.listCalls({ status: "failed", feature: "ai_analyst", limit: 10, offset: 0 });

      expect(prismaMock.aiCallLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "failed", feature: "ai_analyst" } }),
      );
    });
  });
});
