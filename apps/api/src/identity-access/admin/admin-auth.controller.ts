import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { RequestMeta } from "../investor/investor.types";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminLogoutDto } from "./dto/admin-logout.dto";
import { AdminRefreshDto } from "./dto/admin-refresh.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { CurrentAdmin } from "./current-admin.decorator";
import { AdminAuthTokens, AuthenticatedAdminUser, PublicAdminUser } from "./admin.types";

function requestMeta(req: Request): RequestMeta {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}

/**
 * Admin auth plane — `/v1/admin/auth/*`, against the `admin_users` table.
 * Fully isolated from `/v1/auth/*` (see `InvestorAuthController`): separate
 * controller/service/guard, separate JWT secret/issuer/audience, MFA-aware
 * login. No self-registration endpoint by design (see
 * `AdminAuthService`'s class doc).
 *
 * Throttle limits are tighter than the investor plane's — a compromised
 * admin credential is higher blast-radius, so brute-forcing it should be
 * materially harder.
 */
@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300_000 } }) // 5 / 5 min per IP
  login(@Body() dto: AdminLoginDto, @Req() req: Request): Promise<AdminAuthTokens> {
    return this.authService.login(dto, requestMeta(req));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300_000 } }) // 10 / 5 min per IP
  refresh(@Body() dto: AdminRefreshDto, @Req() req: Request): Promise<AdminAuthTokens> {
    return this.authService.refresh(dto, requestMeta(req));
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 300_000 } }) // 10 / 5 min per IP
  logout(@Body() dto: AdminLogoutDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @Post("mfa/setup")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  setupMfa(@CurrentAdmin() admin: AuthenticatedAdminUser): { secret: string; otpauthUri: string } {
    return this.authService.setupMfa(admin);
  }

  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  verifyMfa(@CurrentAdmin() admin: AuthenticatedAdminUser, @Body() dto: MfaVerifyDto): Promise<PublicAdminUser> {
    return this.authService.confirmMfaSetup(admin.id, dto);
  }
}
