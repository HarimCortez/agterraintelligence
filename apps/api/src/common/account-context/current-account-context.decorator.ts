import { ExecutionContext, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { AccountContext, AccountScopedIdentity } from "./account-context";

/**
 * Param decorator that builds an `AccountContext` from the authenticated
 * investor attached to the request by `JwtAuthGuard` (`req.user`). Route
 * handlers should take this instead of `@CurrentUser()` whenever they're
 * about to run an account-scoped query, so the org-seam boundary is always
 * front and center at the call site:
 *
 *   @Get()
 *   list(@CurrentAccountContext() ctx: AccountContext) { ... }
 *
 * Requires `JwtAuthGuard` (or another guard that populates `req.user`) to
 * run first — throws if `req.user` is missing.
 */
export const CurrentAccountContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccountContext => {
    const request = ctx.switchToHttp().getRequest<{ user?: AccountScopedIdentity }>();
    if (!request.user) {
      throw new UnauthorizedException(
        "AccountContext requested on a route with no authenticated investor user — is JwtAuthGuard applied?",
      );
    }
    return AccountContext.forUser(request.user);
  },
);
