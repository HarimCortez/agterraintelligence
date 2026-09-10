import { AdminUser } from "@agterra/db";
import { PublicAdminUser } from "./admin.types";

/**
 * Explicit allow-list mapper — excludes `passwordHash` and, just as
 * important on this plane, `mfaSecret` (a live TOTP seed must never reach a
 * response body). Mirrors `investor.serializers.ts#toPublicUser`.
 */
export function toPublicAdminUser(admin: AdminUser): PublicAdminUser {
  return {
    id: admin.id,
    email: admin.email,
    internalRole: admin.internalRole,
    status: admin.status,
    mfaEnrolled: admin.mfaSecret !== null,
    createdAt: admin.createdAt,
  };
}
