/**
 * POST /v1/auth/register, /v1/auth/login, /v1/auth/logout client — types +
 * fetch + error-shape parsing, verified against the actual running API
 * (apps/api/src/identity-access/investor/investor-auth.controller.ts and
 * investor-auth.service.ts) via curl, not guessed at:
 *   - register: 201 with the created `PublicUser` shape (no tokens issued).
 *   - login: 200 with `{ accessToken, refreshToken, user }`.
 *   - logout: 204, no body.
 *   - Errors are Nest's default HttpException JSON shape,
 *     `{ statusCode, error, message }`, where `message` is a plain string
 *     for most errors (401 invalid credentials, 409 duplicate email) but an
 *     array of per-field strings for class-validator's 400s.
 *
 * Base URL: always the same-origin `/api/*` rewrite (next.config.mjs) —
 * every caller here is a client component (login/register forms, the
 * nav-rail logout action), never a Server Component, so there's no
 * server-vs-client base-URL split to handle like `properties-api.ts` has.
 */

export interface AuthUser {
  id: string;
  email: string;
  externalRole: string;
  orgId: string | null;
  status: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const AUTH_BASE_URL = "/api/v1/auth";

/** Thrown for any non-2xx response from the auth endpoints, `message` already resolved to a single display-ready string. */
export class AuthApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // Response body wasn't JSON — fall through to the generic fallback.
  }
  return fallback;
}

export async function registerUser(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${AUTH_BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new AuthApiError(res.status, await parseErrorMessage(res, "Registration failed. Please try again."));
  }
  return (await res.json()) as AuthUser;
}

export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  const res = await fetch(`${AUTH_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new AuthApiError(res.status, await parseErrorMessage(res, "Login failed. Please try again."));
  }
  return (await res.json()) as AuthTokens;
}

/**
 * Fire-and-forget from the caller's perspective — `auth-store.ts`'s
 * `logout()` doesn't await this, per this pass's requirement that logging
 * out client-side must never block on the network. The API treats an
 * unknown/already-revoked refresh token as a no-op 204 (see
 * `InvestorAuthService.logout`'s idempotency comment), so there's nothing
 * meaningful for a caller to react to even on failure.
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  await fetch(`${AUTH_BASE_URL}/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
