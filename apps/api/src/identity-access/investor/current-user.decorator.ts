import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { AuthenticatedInvestorUser } from "./investor.types";

/** The authenticated investor attached by `JwtAuthGuard`. Use `@CurrentAccountContext()` instead for account-scoped queries — this is for when you need the role/email/status too. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedInvestorUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedInvestorUser }>();
    return request.user;
  },
);
