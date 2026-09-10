import { Request } from "express";

/** Pulls the token out of `Authorization: Bearer <token>` — returns `undefined` if absent/malformed. */
export function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token;
}
