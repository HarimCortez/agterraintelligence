import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "./audit-log.service";

describe("AuditLogService", () => {
  let service: AuditLogService;
  const prismaMock = { auditLogEntry: { create: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(AuditLogService);
  });

  it("writes a row with all fields, defaulting omitted optionals to null", async () => {
    prismaMock.auditLogEntry.create.mockResolvedValue({});

    await service.record({ actorId: "admin-1", actorEmail: "a@example.com", action: "admin.login.success" });

    expect(prismaMock.auditLogEntry.create).toHaveBeenCalledWith({
      data: {
        actorId: "admin-1",
        actorEmail: "a@example.com",
        action: "admin.login.success",
        targetType: null,
        targetId: null,
        metadata: undefined,
      },
    });
  });

  it("never throws when the write fails — a failed audit write must not fail the action being audited", async () => {
    prismaMock.auditLogEntry.create.mockRejectedValue(new Error("db unavailable"));

    await expect(service.record({ action: "fulfillment.retry" })).resolves.toBeUndefined();
  });
});
