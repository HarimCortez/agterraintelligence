import { ExternalRole, UserStatus } from "@agterra/db";

/** Shape attached to `req.user` by `JwtAuthGuard` after verifying an investor access token. */
export interface AuthenticatedInvestorUser {
  id: string;
  email: string;
  externalRole: ExternalRole;
  orgId: string | null;
  status: UserStatus;
}

/**
 * The only shape of a `users` row that is ever allowed to leave the process
 * in an HTTP response — `password_hash` is not a field here, by
 * construction, not by convention (see `toPublicUser`).
 */
export interface PublicUser {
  id: string;
  email: string;
  externalRole: ExternalRole;
  orgId: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}
