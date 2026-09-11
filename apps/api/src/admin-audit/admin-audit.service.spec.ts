import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AdminAuditService } from "./admin-audit.service";

describe("AdminAuditService.listEntries", () => {
  let service: AdminAuditService;
  const prismaMock = { auditLogEntry: { findMany: jest.fn(), count: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminAuditService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AdminAuditService);
  });

  it("returns entries newest-first with pagination metadata", async () => {
    prismaMock.auditLogEntry.findMany.mockResolvedValue([
      {
        id: "entry-1",
        actorEmail: "admin@example.com",
        action: "admin.login.success",
        targetType: null,
        targetId: null,
        metadata: { ipAddress: "1.2.3.4" },
        createdAt: new Date("2026-01-02"),
      },
    ]);
    prismaMock.auditLogEntry.count.mockResolvedValue(1);

    const result = await service.listEntries({ limit: 50, offset: 0 });

    expect(prismaMock.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { createdAt: "desc" } }),
    );
    expect(result.results[0]).toMatchObject({ id: "entry-1", action: "admin.login.success" });
    expect(result.total).toBe(1);
  });

  it("filters by exact action and case-insensitive actorEmail substring when provided", async () => {
    prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
    prismaMock.auditLogEntry.count.mockResolvedValue(0);

    await service.listEntries({ action: "fulfillment.retry", actorEmail: "admin", limit: 50, offset: 0 });

    expect(prismaMock.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: "fulfillment.retry", actorEmail: { contains: "admin", mode: "insensitive" } },
      }),
    );
  });
});
