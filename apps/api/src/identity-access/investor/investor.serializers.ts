import { User } from "@agterra/db";
import { PublicUser } from "./investor.types";

/**
 * Explicit allow-list mapper from a Prisma `User` row to the public
 * response shape. Controllers/services must always return this (or
 * `AuthTokens`, which embeds it), never a raw Prisma `User` — that's the
 * concrete mechanism behind the "passwords never returned in responses"
 * security baseline: there is no code path that serializes `passwordHash`
 * because nothing here reads it.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    externalRole: user.externalRole,
    orgId: user.orgId,
    status: user.status,
    createdAt: user.createdAt,
  };
}
