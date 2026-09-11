/**
 * Shared error types for authenticated (`adminAuthFetch`-based) API clients.
 * `UnauthorizedError` mirrors investor-web's — a 401 always means "logged
 * out / token expired," no silent refresh (same REQUIREMENTS.md decision
 * log item 8 this codebase follows everywhere). `ForbiddenError` is new
 * here: this is the first admin frontend screen gated by `PermissionsGuard`
 * (`billing.read`), so a logged-in-but-not-permitted admin is a real,
 * distinct case from "not logged in at all" — 403, not 401.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Your session has expired. Please log in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Your role doesn't have access to this screen.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
