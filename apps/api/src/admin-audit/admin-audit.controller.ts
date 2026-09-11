import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { AdminAuditService } from "./admin-audit.service";
import { ListAuditLogQuery } from "./dto/list-audit-log.query";
import { ListAuditLogResponseDto } from "./dto/admin-audit.dto";

/** `/v1/admin/audit/*` — read-only, gated by `audit.read` (granted to super_admin/admin/readonly_analyst only — see `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`; narrower than billing/revenue.read since login-failure entries can reveal security-relevant activity). */
@Controller("admin/audit")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@RequirePermission("audit.read")
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get("entries")
  listEntries(@Query() query: ListAuditLogQuery): Promise<ListAuditLogResponseDto> {
    return this.auditService.listEntries(query);
  }
}
