import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { InvestorAuthService } from "./investor-auth.service";
import { AuthTokens, PublicUser, RequestMeta } from "./investor.types";

function requestMeta(req: Request): RequestMeta {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}

/**
 * Investor auth plane — `/v1/auth/*`, against the `users` table. Fully
 * separate from `/v1/admin/auth/*` (see `AdminAuthController`): different
 * controller, different service, different JWT secret/issuer/audience.
 *
 * Each route carries its own tighter `@Throttle` override on top of the
 * app-wide default (registered in `IdentityAccessModule`) — brute-force/
 * credential-stuffing protection per ARCHITECTURE.md's Security
 * Considerations ("rate limiting... for cost control and abuse
 * prevention").
 */
@Controller("auth")
export class InvestorAuthController {
  constructor(private readonly authService: InvestorAuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 600_000 } }) // 5 / 10 min per IP
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300_000 } }) // 10 / 5 min per IP
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.login(dto, requestMeta(req));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 300_000 } }) // 20 / 5 min per IP
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.refresh(dto, requestMeta(req));
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 300_000 } }) // 20 / 5 min per IP
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.authService.logout(dto);
  }
}
