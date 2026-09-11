/**
 * POST /v1/admin/auth/login, /logout client — types + fetch + error-shape
 * parsing, verified against the actual running API
 * (apps/api/src/identity-access/admin/admin-auth.controller.ts and
 * admin-auth.service.ts), not guessed at:
 *   - login: 200 with `{ accessToken, refreshToken, adminUser }`, OR a 401
 *     whose body has `error: "mfa_required"` (see `MfaRequiredException`)
 *     when the account has MFA enrolled and no/an invalid `totpCode` was
 *     supplied — distinct from a plain bad-credentials 401, which has no
 *     `error` field set to that value.
 *   - logout: 204, no body, idempotent even for an unknown/already-revoked
 *     token (see `AdminAuthService.logout`).
 *
 * No self-registration endpoint exists on this plane by design — admin
 * accounts are provisioned out-of-band, so there's no `registerAdmin` here.
 */

export interface AdminAuthUser {
  id: string;
  email: string;
  internalRole: string;
  status: string;
  mfaEnrolled: boolean;
  createdAt: string;
}

export interface AdminAuthTokens {
  accessToken: string;
  refreshToken: string;
  adminUser: AdminAuthUser;
}

const ADMIN_AUTH_BASE_URL = "/api/v1/admin/auth";

export class AdminAuthApiError extends Error {
  status: number;
  /** `"mfa_required"` when the caller should re-prompt for a TOTP code instead of showing a generic error. */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AdminAuthApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response, fallback: string): Promise<AdminAuthApiError> {
  try {
    const body = (await res.json()) as { message?: string | string[]; error?: string };
    const message = Array.isArray(body.message) ? body.message.join(" ") : (body.message ?? fallback);
    return new AdminAuthApiError(res.status, message, body.error);
  } catch {
    return new AdminAuthApiError(res.status, fallback);
  }
}

export async function loginAdmin(email: string, password: string, totpCode?: string): Promise<AdminAuthTokens> {
  const res = await fetch(`${ADMIN_AUTH_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
  });
  if (!res.ok) {
    throw await parseError(res, "Login failed. Please try again.");
  }
  return (await res.json()) as AdminAuthTokens;
}

/** Fire-and-forget, matching investor-web's `logoutUser` — see `admin-auth-store.ts`'s `logout()`. */
export async function logoutAdmin(refreshToken: string): Promise<void> {
  await fetch(`${ADMIN_AUTH_BASE_URL}/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
