import { AdminUserStatus, InternalRole } from "@agterra/db";

/** Shape attached to `req.adminUser` by `AdminJwtAuthGuard` after verifying an admin access token. */
export interface AuthenticatedAdminUser {
  id: string;
  email: string;
  internalRole: InternalRole;
  status: AdminUserStatus;
  mfaEnrolled: boolean;
}

/** Never includes `password_hash` or `mfa_secret` — see `toPublicAdminUser`. */
export interface PublicAdminUser {
  id: string;
  email: string;
  internalRole: InternalRole;
  status: AdminUserStatus;
  mfaEnrolled: boolean;
  createdAt: Date;
}

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
  adminUser: PublicAdminUser;
}
