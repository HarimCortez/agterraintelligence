import { SetMetadata } from "@nestjs/common";
import { ExternalRole } from "@agterra/db";

export const EXTERNAL_ROLES_KEY = "external_roles";

/**
 * External RBAC (ARCHITECTURE.md "Authentication / Authorization" >
 * "External RBAC (7 roles)"). Marks a route/controller as requiring the
 * caller's `users.external_role` to be one of the listed roles. Must be
 * paired with `ExternalRolesGuard` (which reads this metadata) running
 * after `JwtAuthGuard` (which populates `req.user`):
 *
 *   @UseGuards(JwtAuthGuard, ExternalRolesGuard)
 *   @Roles(ExternalRole.investor_subscriber, ExternalRole.professional_subscriber)
 *   @Get('advanced-thing')
 *   ...
 *
 * A route with no `@Roles(...)` and only `JwtAuthGuard` applied is
 * "any authenticated investor" — that's intentional, not an oversight;
 * most Phase-0-and-later routes don't need a role restriction beyond being
 * logged in. Full entitlement resolution (subscriptions, report
 * entitlements) is a later phase per ARCHITECTURE.md; this decorator/guard
 * is the role-check primitive those build on top of.
 */
export const Roles = (...roles: ExternalRole[]) => SetMetadata(EXTERNAL_ROLES_KEY, roles);
