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
