import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExternalRolesGuard } from "./external-roles.guard";
import { AuthenticatedInvestorUser } from "./investor.types";

function makeContext(user?: AuthenticatedInvestorUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const freeUser: AuthenticatedInvestorUser = {
  id: "user-1",
  email: "u@example.com",
  externalRole: "free",
  orgId: null,
  status: "active",
};

const proUser: AuthenticatedInvestorUser = { ...freeUser, id: "user-2", externalRole: "professional_subscriber" };

describe("ExternalRolesGuard", () => {
  let getAllAndOverride: jest.Mock;
  let guard: ExternalRolesGuard;

  beforeEach(() => {
    getAllAndOverride = jest.fn();
    const reflector = { getAllAndOverride } as unknown as Reflector;
    guard = new ExternalRolesGuard(reflector);
  });

  it("allows any authenticated user through when the route declares no @Roles", () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext(freeUser))).toBe(true);
  });

  it("allows through when the user's role is in the required list", () => {
    getAllAndOverride.mockReturnValue(["investor_subscriber", "professional_subscriber"]);
    expect(guard.canActivate(makeContext(proUser))).toBe(true);
  });

  it("throws Forbidden when the user's role is not in the required list", () => {
    getAllAndOverride.mockReturnValue(["investor_subscriber", "professional_subscriber"]);
    expect(() => guard.canActivate(makeContext(freeUser))).toThrow(ForbiddenException);
  });

  it("throws Unauthorized if there is no req.user at all (JwtAuthGuard didn't run)", () => {
    getAllAndOverride.mockReturnValue(["free"]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });
});
