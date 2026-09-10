import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { PrismaService } from "../../common/prisma/prisma.service";
import { extractBearerToken } from "../tokens/extract-bearer-token";
import { TokenService } from "../tokens/token.service";
import { getInvestorAccessSignOptions } from "./investor-auth.config";
import { AuthenticatedInvestorUser } from "./investor.types";

interface InvestorAccessTokenPayload {
  sub: string;
}

/**
 * Verifies an investor-plane access token (signed with
 * `JWT_INVESTOR_ACCESS_SECRET`, never `JWT_ADMIN_ACCESS_SECRET`) and
 * attaches the current user to `req.user`. Re-reads the user row from the
 * database on every request (rather than trusting the JWT's embedded role
 * claim) so a suspension or role change takes effect immediately instead of
 * waiting out the access token's TTL.
 *
 * Apply before `ExternalRolesGuard` and before `@CurrentAccountContext()` /
 * `@CurrentUser()` are used in a handler — both read `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedInvestorUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer access token");
    }

    let payload: InvestorAccessTokenPayload;
    try {
      payload = await this.tokens.verifyToken<InvestorAccessTokenPayload>(
        token,
        getInvestorAccessSignOptions(this.config),
      );
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    request.user = {
      id: user.id,
      email: user.email,
      externalRole: user.externalRole,
      orgId: user.orgId,
      status: user.status,
    };
    return true;
  }
}
