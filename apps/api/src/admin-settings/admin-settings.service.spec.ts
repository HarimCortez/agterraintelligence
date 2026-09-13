import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminSettingsService } from "./admin-settings.service";

const ADMIN: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  internalRole: "super_admin",
  status: "active",
  mfaEnrolled: false,
};

describe("AdminSettingsService", () => {
  let service: AdminSettingsService;

  const prismaMock = {
    adminUser: { findMany: jest.fn() },
    auditLogEntry: { groupBy: jest.fn() },
    rolePermission: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  };
  const auditLogMock = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();
    service = moduleRef.get(AdminSettingsService);
  });

  describe("listAdminUsers", () => {
    it("derives lastLoginAt from the most recent admin.login.success audit entry, and null when there's never been one", async () => {
      const loginTime = new Date("2026-09-01T00:00:00Z");
      prismaMock.adminUser.findMany.mockResolvedValue([
        { id: "a1", email: "logged-in@example.com", internalRole: "admin", status: "active", mfaSecret: "secret", createdAt: new Date() },
        { id: "a2", email: "never-logged-in@example.com", internalRole: "support_agent", status: "active", mfaSecret: null, createdAt: new Date() },
      ]);
      prismaMock.auditLogEntry.groupBy.mockResolvedValue([{ actorId: "a1", _max: { createdAt: loginTime } }]);

      const result = await service.listAdminUsers();

      const a1 = result.results.find((r) => r.id === "a1")!;
      const a2 = result.results.find((r) => r.id === "a2")!;
      expect(a1.lastLoginAt).toEqual(loginTime);
      expect(a1.mfaEnrolled).toBe(true);
      expect(a2.lastLoginAt).toBeNull();
      expect(a2.mfaEnrolled).toBe(false);
    });
  });

  describe("getPermissionMatrix", () => {
    it("fills in allowed=false for every (role, permissionKey) pair with no row, matching PermissionsService's fail-closed runtime behavior", async () => {
      prismaMock.rolePermission.findMany.mockResolvedValue([
        { role: "super_admin", permissionKey: "billing.read", allowed: true, updatedAt: new Date(), updatedBy: { email: "admin@example.com" } },
      ]);

      const result = await service.getPermissionMatrix();

      expect(result.permissionKeys).toEqual(["billing.read"]);
      expect(result.roles).toHaveLength(8);
      // 1 permission key x 8 roles = 8 cells total.
      expect(result.cells).toHaveLength(8);

      const grantedCell = result.cells.find((c) => c.role === "super_admin");
      expect(grantedCell).toMatchObject({ allowed: true, updatedByEmail: "admin@example.com" });

      const ungrantedCell = result.cells.find((c) => c.role === "readonly_analyst");
      expect(ungrantedCell).toMatchObject({ allowed: false, updatedAt: null, updatedByEmail: null });
    });
  });

  describe("updatePermission", () => {
    it("rejects an unknown role", async () => {
      await expect(
        service.updatePermission("not_a_real_role" as never, "billing.read", { allowed: true }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.rolePermission.upsert).not.toHaveBeenCalled();
    });

    it("rejects a permission key that doesn't already exist in role_permissions", async () => {
      prismaMock.rolePermission.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePermission("admin", "made_up.key", { allowed: true }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.rolePermission.upsert).not.toHaveBeenCalled();
    });

    it("upserts the cell, sets updatedById, and audits the previous and new value", async () => {
      prismaMock.rolePermission.findFirst.mockResolvedValue({ id: "existing-key-row" });
      prismaMock.rolePermission.findUnique.mockResolvedValue({ allowed: false });
      prismaMock.rolePermission.upsert.mockResolvedValue({ id: "rp-1", allowed: true });

      const result = await service.updatePermission("support_agent", "support.respond", { allowed: true }, ADMIN);

      expect(prismaMock.rolePermission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role_permissionKey: { role: "support_agent", permissionKey: "support.respond" } },
          create: expect.objectContaining({ allowed: true, updatedById: "admin-1" }),
          update: expect.objectContaining({ allowed: true, updatedById: "admin-1" }),
        }),
      );
      expect(result).toEqual({ role: "support_agent", permissionKey: "support.respond", allowed: true });
      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "settings.permission_update",
          targetType: "role_permission",
          targetId: "rp-1",
          metadata: { role: "support_agent", permissionKey: "support.respond", previousAllowed: false, newAllowed: true },
        }),
      );
    });

    it("records previousAllowed as false when the cell had no row at all (not just when allowed=false)", async () => {
      prismaMock.rolePermission.findFirst.mockResolvedValue({ id: "existing-key-row" });
      prismaMock.rolePermission.findUnique.mockResolvedValue(null);
      prismaMock.rolePermission.upsert.mockResolvedValue({ id: "rp-2", allowed: true });

      await service.updatePermission("readonly_analyst", "billing.read", { allowed: true }, ADMIN);

      expect(auditLogMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ previousAllowed: false }) }),
      );
    });
  });
});
