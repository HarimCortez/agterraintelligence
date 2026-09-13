import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { InternalRole } from "@agterra/db";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { CurrentAdmin } from "../identity-access/admin/current-admin.decorator";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminSettingsService } from "./admin-settings.service";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { ListAdminUsersResponseDto, PermissionMatrixResponseDto, UpdatePermissionResponseDto } from "./dto/admin-settings.dto";

/**
 * `/v1/admin/settings/*`. Reads gated by `settings.read`; editing the
 * permission matrix by the narrower `settings.write` — deliberately
 * super_admin-only (see `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`)
 * since this action can grant/revoke access to every other admin module,
 * including itself.
 */
@Controller("admin/settings")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get("admin-users")
  @RequirePermission("settings.read")
  listAdminUsers(): Promise<ListAdminUsersResponseDto> {
    return this.settingsService.listAdminUsers();
  }

  @Get("permissions")
  @RequirePermission("settings.read")
  getPermissionMatrix(): Promise<PermissionMatrixResponseDto> {
    return this.settingsService.getPermissionMatrix();
  }

  @Patch("permissions/:role/:permissionKey")
  @RequirePermission("settings.write")
  updatePermission(
    @Param("role") role: InternalRole,
    @Param("permissionKey") permissionKey: string,
    @Body() input: UpdatePermissionDto,
    @CurrentAdmin() admin: AuthenticatedAdminUser,
  ): Promise<UpdatePermissionResponseDto> {
    return this.settingsService.updatePermission(role, permissionKey, input, admin);
  }
}
