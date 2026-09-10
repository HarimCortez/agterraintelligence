import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "internal_permission_key";

/**
 * Internal RBAC (ARCHITECTURE.md "Authentication / Authorization" >
 * "Internal RBAC (8 roles)"). Marks a route as requiring a specific
 * `role_permissions.permission_key` to be `allowed` for the caller's
 * `internal_role` — table-driven, not a hardcoded role list, per Section
 * F/DoD #4's requirement to enforce permissions across "a large and growing
 * set of admin actions" without redeploying for each new permission:
 *
 *   @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
 *   @RequirePermission('billing.refund')
 *   @Post('refund')
 *   ...
 *
 * Adding a new gated action anywhere in the admin console is: pick a
 * `permission_key` string, put this decorator on the route, and insert
 * `role_permissions` rows for whichever roles should have it — no guard
 * code changes.
 */
export const RequirePermission = (permissionKey: string) => SetMetadata(PERMISSION_KEY, permissionKey);
