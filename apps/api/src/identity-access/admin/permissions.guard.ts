import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsService } from "./permissions.service";
import { PERMISSION_KEY } from "./require-permission.decorator";
import { AuthenticatedAdminUser } from "./admin.types";

/**
 * Enforces `@RequirePermission(...)` metadata against the `role_permissions`
 * policy table (via `PermissionsService`). Must run after
 * `AdminJwtAuthGuard`. A route with no `@RequirePermission(...)` metadata is
 * allowed through (authentication-only) — every admin route that performs a
 * discrete gated action (billing, refunds, data edits, AI/model settings,
 * audit-log access, etc.) is expected to declare one.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ adminUser?: AuthenticatedAdminUser }>();
    const adminUser = request.adminUser;
    if (!adminUser) {
      throw new UnauthorizedException("PermissionsGuard requires AdminJwtAuthGuard to run first");
    }

    const allowed = await this.permissions.isAllowed(adminUser.internalRole, requiredPermission);
    if (!allowed) {
      throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
    }
    return true;
  }
}
