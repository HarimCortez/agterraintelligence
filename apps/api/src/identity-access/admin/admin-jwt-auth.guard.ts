import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { PrismaService } from "../../common/prisma/prisma.service";
import { extractBearerToken } from "../tokens/extract-bearer-token";
import { TokenService } from "../tokens/token.service";
import { getAdminAccessSignOptions } from "./admin-auth.config";
import { AuthenticatedAdminUser } from "./admin.types";

interface AdminAccessTokenPayload {
  sub: string;
}

/**
 * Verifies an admin-plane access token (signed with
 * `JWT_ADMIN_ACCESS_SECRET`, never `JWT_INVESTOR_ACCESS_SECRET`) and
 * attaches the current admin to `req.adminUser` — a different request
 * property than the investor plane's `req.user`, so the two can never be
 * confused by a handler that forgets which guard ran.
 *
 * Apply before `PermissionsGuard` and before `@CurrentAdmin()` is used.
 */
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { adminUser?: AuthenticatedAdminUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer access token");
    }

    let payload: AdminAccessTokenPayload;
    try {
      payload = await this.tokens.verifyToken<AdminAccessTokenPayload>(token, getAdminAccessSignOptions(this.config));
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    request.adminUser = {
      id: admin.id,
      email: admin.email,
      internalRole: admin.internalRole,
      status: admin.status,
      mfaEnrolled: admin.mfaSecret !== null,
    };
    return true;
  }
}
