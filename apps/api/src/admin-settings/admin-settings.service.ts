import { BadRequestException, Injectable } from "@nestjs/common";
import { InternalRole } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import {
  AdminUserRowDto,
  ListAdminUsersResponseDto,
  PermissionCellDto,
  PermissionMatrixResponseDto,
  UpdatePermissionResponseDto,
} from "./dto/admin-settings.dto";

/** Enum declaration order, matching `packages/db/prisma/schema.prisma`'s `InternalRole`. */
const ALL_ROLES: InternalRole[] = [
  "super_admin",
  "admin",
  "support_agent",
  "data_qa_reviewer",
  "report_fulfillment_manager",
  "billing_manager",
  "ai_model_monitor",
  "readonly_analyst",
];

/**
 * Administration Settings (REQUIREMENTS.md Section 9/10.2): real admin
 * user visibility and a real, editable role→permission matrix — the exact
 * `role_permissions` table every other admin module's `PermissionsGuard`
 * has been checking against all session. `role_permissions.updatedById`/
 * `updatedAt` already existed in the schema for exactly this screen (see
 * that model's doc comment) — this is the first code that writes them.
 *
 * Deliberately NOT here — most of REQUIREMENTS.md's fuller spec (branding,
 * notifications, integrations, API/developer keys, compliance, retention
 * policy, maintenance mode, danger zone): none of those have a real
 * underlying system yet, and admin-user creation/role-reassignment stays
 * out of scope too, consistent with the standing "no self-registration,
 * admin_users provisioned out-of-band" security decision documented in
 * this repo's CLAUDE.md.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listAdminUsers(): Promise<ListAdminUsersResponseDto> {
    const [admins, lastLogins] = await Promise.all([
      this.prisma.adminUser.findMany({
        select: { id: true, email: true, internalRole: true, status: true, mfaSecret: true, createdAt: true },
        orderBy: { email: "asc" },
      }),
      this.prisma.auditLogEntry.groupBy({
        by: ["actorId"],
        where: { action: "admin.login.success", actorId: { not: null } },
        _max: { createdAt: true },
      }),
    ]);

    const lastLoginByAdminId = new Map(lastLogins.map((row) => [row.actorId as string, row._max.createdAt]));

    const results: AdminUserRowDto[] = admins.map((a) => ({
      id: a.id,
      email: a.email,
      internalRole: a.internalRole,
      status: a.status,
      mfaEnrolled: a.mfaSecret !== null,
      createdAt: a.createdAt,
      lastLoginAt: lastLoginByAdminId.get(a.id) ?? null,
    }));

    return { results };
  }

  async getPermissionMatrix(): Promise<PermissionMatrixResponseDto> {
    const rows = await this.prisma.rolePermission.findMany({
      include: { updatedBy: { select: { email: true } } },
    });

    const permissionKeys = [...new Set(rows.map((r) => r.permissionKey))].sort();
    const existing = new Map(rows.map((r) => [`${r.role}:${r.permissionKey}`, r]));

    const cells: PermissionCellDto[] = [];
    for (const permissionKey of permissionKeys) {
      for (const role of ALL_ROLES) {
        const row = existing.get(`${role}:${permissionKey}`);
        cells.push({
          role,
          permissionKey,
          allowed: row?.allowed ?? false,
          updatedAt: row?.updatedAt ?? null,
          updatedByEmail: row?.updatedBy?.email ?? null,
        });
      }
    }

    return { permissionKeys, roles: ALL_ROLES, cells };
  }

  /**
   * Toggles one (role, permissionKey) cell. `permissionKey` must already
   * exist in role_permissions — this endpoint changes who has an existing
   * capability, it does not mint new permission keys (those are added by
   * code + a seed/migration, per every prior module's pattern), so a typo
   * can't silently create a meaningless row.
   */
  async updatePermission(
    role: InternalRole,
    permissionKey: string,
    input: UpdatePermissionDto,
    admin: AuthenticatedAdminUser,
  ): Promise<UpdatePermissionResponseDto> {
    if (!ALL_ROLES.includes(role)) {
      throw new BadRequestException(`Unknown role: ${role}`);
    }
    const knownKey = await this.prisma.rolePermission.findFirst({ where: { permissionKey }, select: { id: true } });
    if (!knownKey) {
      throw new BadRequestException(`Unknown permission key: ${permissionKey}`);
    }

    const existing = await this.prisma.rolePermission.findUnique({
      where: { role_permissionKey: { role, permissionKey } },
    });

    const updated = await this.prisma.rolePermission.upsert({
      where: { role_permissionKey: { role, permissionKey } },
      create: { role, permissionKey, allowed: input.allowed, updatedById: admin.id },
      update: { allowed: input.allowed, updatedById: admin.id },
    });

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "settings.permission_update",
      targetType: "role_permission",
      targetId: updated.id,
      metadata: { role, permissionKey, previousAllowed: existing?.allowed ?? false, newAllowed: input.allowed },
    });

    return { role, permissionKey, allowed: updated.allowed };
  }
}
