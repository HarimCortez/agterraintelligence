import { ConfigService } from "@nestjs/config";
import { SignOptions } from "../tokens/token.service";

/**
 * Single source of truth for investor-plane JWT config, shared by
 * `InvestorAuthService` (signing) and `JwtAuthGuard` (verifying) so they
 * can never drift apart on issuer/audience/secret — a mismatch there would
 * either lock every investor out or silently accept the wrong tokens.
 */
export function getInvestorAccessSignOptions(config: ConfigService): SignOptions {
  return {
    secret: config.getOrThrow<string>("JWT_INVESTOR_ACCESS_SECRET"),
    issuer: config.get<string>("JWT_INVESTOR_ISSUER", "agterra-investor-auth"),
    audience: config.get<string>("JWT_INVESTOR_AUDIENCE", "agterra-investor"),
    expiresIn: config.get<string>("JWT_INVESTOR_ACCESS_TTL", "15m"),
  };
}

export function getInvestorRefreshSignOptions(config: ConfigService): SignOptions {
  return {
    secret: config.getOrThrow<string>("JWT_INVESTOR_REFRESH_SECRET"),
    issuer: config.get<string>("JWT_INVESTOR_ISSUER", "agterra-investor-auth"),
    audience: config.get<string>("JWT_INVESTOR_AUDIENCE", "agterra-investor"),
    expiresIn: config.get<string>("JWT_INVESTOR_REFRESH_TTL", "30d"),
  };
}
