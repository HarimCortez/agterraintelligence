import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { ReportGenerationService } from "../monetization/report-generation.service";
import { AdminReportFulfillmentService } from "./admin-report-fulfillment.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "super_admin",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminReportFulfillmentService", () => {
  let service: AdminReportFulfillmentService;

  const prismaMock = {
    reportOrder: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const reportGenerationMock = { runGeneration: jest.fn() };
  const auditLogMock = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReportFulfillmentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReportGenerationService, useValue: reportGenerationMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = moduleRef.get(AdminReportFulfillmentService);
  });

  describe("getSummary", () => {
    it("computes average fulfillment seconds across delivered orders only", async () => {
      prismaMock.reportOrder.groupBy.mockResolvedValue([
        { status: "delivered", _count: { _all: 2 } },
        { status: "failed", _count: { _all: 1 } },
      ]);
      prismaMock.reportOrder.findMany.mockResolvedValue([
        { createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:10Z") }, // 10s
        { createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:20Z") }, // 20s
      ]);

      const result = await service.getSummary();

      expect(result.averageFulfillmentSeconds).toBe(15);
      expect(result.ordersByStatus).toEqual({ delivered: 2, failed: 1 });
      expect(result.failedOrderCount).toBe(1);
    });

    it("returns null (not 0/NaN) average fulfillment time when nothing is delivered yet", async () => {
      prismaMock.reportOrder.groupBy.mockResolvedValue([]);
      prismaMock.reportOrder.findMany.mockResolvedValue([]);

      const result = await service.getSummary();

      expect(result.averageFulfillmentSeconds).toBeNull();
      expect(result.failedOrderCount).toBe(0);
    });
  });

  describe("retryOrder", () => {
    it("rejects with 404 when the order doesn't exist", async () => {
      prismaMock.reportOrder.findUnique.mockResolvedValue(null);

      await expect(service.retryOrder("missing-id", ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(reportGenerationMock.runGeneration).not.toHaveBeenCalled();
      expect(auditLogMock.record).not.toHaveBeenCalled();
    });

    it("rejects with 409 when the order isn't currently 'failed' (e.g. already delivered)", async () => {
      prismaMock.reportOrder.findUnique.mockResolvedValue({ status: "delivered" });

      await expect(service.retryOrder("order-1", ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(reportGenerationMock.runGeneration).not.toHaveBeenCalled();
      expect(auditLogMock.record).not.toHaveBeenCalled();
    });

    it("calls runGeneration, records an audit entry, and returns the resulting status for a 'failed' order", async () => {
      prismaMock.reportOrder.findUnique.mockResolvedValue({ status: "failed" });
      prismaMock.reportOrder.findUniqueOrThrow.mockResolvedValue({ status: "delivered" });

      const result = await service.retryOrder("order-1", ADMIN);

      expect(reportGenerationMock.runGeneration).toHaveBeenCalledWith("order-1");
      expect(result).toEqual({ id: "order-1", status: "delivered" });
      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "fulfillment.retry",
          targetType: "report_order",
          targetId: "order-1",
          metadata: { previousStatus: "failed", resultStatus: "delivered" },
        }),
      );
    });
  });
});
