import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { FemaFloodZoneIngestionService } from "../ingestion/fema-flood-zone-ingestion.service";
import { AdminIngestionService } from "./admin-ingestion.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "super_admin",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminIngestionService", () => {
  let service: AdminIngestionService;

  const prismaMock = { ingestionRun: { findMany: jest.fn(), count: jest.fn() } };
  const femaIngestionMock = { trigger: jest.fn() };
  const auditLogMock = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FemaFloodZoneIngestionService, useValue: femaIngestionMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = moduleRef.get(AdminIngestionService);
  });

  describe("listRuns", () => {
    it("applies default limit/offset and returns total alongside results", async () => {
      prismaMock.ingestionRun.findMany.mockResolvedValue([{ id: "run-1" }]);
      prismaMock.ingestionRun.count.mockResolvedValue(1);

      const result = await service.listRuns({});

      expect(prismaMock.ingestionRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startedAt: "desc" }, take: 20, skip: 0 }),
      );
      expect(result).toEqual({ results: [{ id: "run-1" }], total: 1, limit: 20, offset: 0 });
    });
  });

  describe("triggerFemaFloodZoneRun", () => {
    it("starts the run in the background and returns immediately with a 'running' status, not waiting for completion", async () => {
      femaIngestionMock.trigger.mockResolvedValue({ id: "run-1" });

      const result = await service.triggerFemaFloodZoneRun(ADMIN);

      expect(femaIngestionMock.trigger).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: "run-1",
        status: "running",
        propertiesChecked: 0,
        flagsCreated: 0,
        errorMessage: null,
      });
    });

    it("records an audit entry for the trigger action itself, not the eventual run outcome", async () => {
      femaIngestionMock.trigger.mockResolvedValue({ id: "run-1" });

      await service.triggerFemaFloodZoneRun(ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          actorEmail: "admin@example.com",
          action: "ingestion.run",
          targetType: "ingestion_run",
          targetId: "run-1",
          metadata: { source: "fema_flood_zones" },
        }),
      );
    });
  });
});
