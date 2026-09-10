import { ConfigService } from "@nestjs/config";
import { SignOptions } from "../tokens/token.service";

/**
 * Admin-plane JWT config. Distinct env var names AND distinct defaults from
 * the investor plane (`investor-auth.config.ts`) — shorter session TTLs per
 * ARCHITECTURE.md ("admin sessions shorter-lived"), and a secret that must
 * never be set to the same value as `JWT_INVESTOR_ACCESS_SECRET`/
 * `JWT_INVESTOR_REFRESH_SECRET` (nothing enforces that at runtime beyond
 * using two different env vars — see root CLAUDE.md's Authentication
 * section for the operational note).
 */
export function getAdminAccessSignOptions(config: ConfigService): SignOptions {
  return {
    secret: config.getOrThrow<string>("JWT_ADMIN_ACCESS_SECRET"),
    issuer: config.get<string>("JWT_ADMIN_ISSUER", "agterra-admin-auth"),
    audience: config.get<string>("JWT_ADMIN_AUDIENCE", "agterra-admin"),
    expiresIn: config.get<string>("JWT_ADMIN_ACCESS_TTL", "10m"),
  };
}

export function getAdminRefreshSignOptions(config: ConfigService): SignOptions {
  return {
    secret: config.getOrThrow<string>("JWT_ADMIN_REFRESH_SECRET"),
    issuer: config.get<string>("JWT_ADMIN_ISSUER", "agterra-admin-auth"),
    audience: config.get<string>("JWT_ADMIN_AUDIENCE", "agterra-admin"),
    expiresIn: config.get<string>("JWT_ADMIN_REFRESH_TTL", "12h"),
  };
}
