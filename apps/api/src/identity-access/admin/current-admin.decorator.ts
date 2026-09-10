import { ExecutionContext, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { AuthenticatedAdminUser } from "./admin.types";

/** The authenticated admin attached by `AdminJwtAuthGuard`. Throws if used on a route without it — admin handlers should never silently run unauthenticated. */
export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedAdminUser => {
  const request = ctx.switchToHttp().getRequest<{ adminUser?: AuthenticatedAdminUser }>();
  if (!request.adminUser) {
    throw new UnauthorizedException("CurrentAdmin requested on a route with no authenticated admin — is AdminJwtAuthGuard applied?");
  }
  return request.adminUser;
});
