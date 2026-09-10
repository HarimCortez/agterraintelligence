import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExternalRole } from "@agterra/db";
import { EXTERNAL_ROLES_KEY } from "./roles.decorator";
import { AuthenticatedInvestorUser } from "./investor.types";

/**
 * Enforces `@Roles(...)` metadata against `req.user.externalRole`. Must run
 * after `JwtAuthGuard`. A route with no `@Roles(...)` metadata at all is
 * allowed through (authentication-only) — this guard only restricts routes
 * that opt in.
 */
@Injectable()
export class ExternalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<ExternalRole[] | undefined>(EXTERNAL_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedInvestorUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("ExternalRolesGuard requires JwtAuthGuard to run first");
    }
    if (!requiredRoles.includes(user.externalRole)) {
      throw new ForbiddenException(`This action requires one of the following roles: ${requiredRoles.join(", ")}`);
    }
    return true;
  }
}
