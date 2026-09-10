import { Injectable } from "@nestjs/common";
import { InternalRole } from "@agterra/db";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Table-driven internal RBAC lookup against `role_permissions`. Fail-closed
 * by design: a `(role, permissionKey)` pair with no row at all is denied,
 * same as a row with `allowed = false` — a permission must be explicitly
 * granted, never implicitly available because nobody got around to adding
 * the row yet.
 *
 * No caching layer here for MVP (every check is one indexed query on
 * `role_permissions`, which is small and rarely written). If admin-endpoint
 * request volume ever makes this a hot path, a short-TTL in-memory cache
 * keyed by `(role, permissionKey)` is the natural next step — flagging so
 * it's not forgotten, not building it preemptively.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async isAllowed(role: InternalRole, permissionKey: string): Promise<boolean> {
    const row = await this.prisma.rolePermission.findUnique({
      where: { role_permissionKey: { role, permissionKey } },
    });
    return row?.allowed ?? false;
  }
}
