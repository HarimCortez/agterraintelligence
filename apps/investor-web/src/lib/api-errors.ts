/**
 * Shared error type for authenticated (`authFetch`-based) API clients.
 * Thrown by `watchlist-api.ts` / `saved-searches-api.ts` whenever the API
 * responds `401` — per `auth-fetch.ts`'s doc comment, that always means
 * "logged out / token expired," never "retry with a refreshed token" (no
 * silent refresh in this pass). Callers (mutations' `onError`, queries'
 * error state) check for this specific type to distinguish "you need to log
 * in again" from any other request failure, and react by clearing the
 * session and redirecting to `/login` — see `useHandleUnauthorized`.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Your session has expired. Please log in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when an `authFetch`-based client gets a `403` — unlike
 * `UnauthorizedError` (401, "you're logged out"), this means "you're
 * logged in, but your plan doesn't include this" (a `@Roles(...)`-gated
 * route via `ExternalRolesGuard`, e.g. the AI Analyst's Investor-tier
 * gate). Callers should show an upgrade prompt, not redirect to `/login`.
 */
export class ForbiddenError extends Error {
  constructor(message = "Your current plan doesn't include this feature.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
