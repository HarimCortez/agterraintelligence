import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { PermissionsService } from "./permissions.service";
import { AuthenticatedAdminUser } from "./admin.types";

function makeContext(adminUser?: AuthenticatedAdminUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ adminUser }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const admin: AuthenticatedAdminUser = {
  id: "admin-1",
  email: "a@example.com",
  internalRole: "billing_manager",
  status: "active",
  mfaEnrolled: true,
};

describe("PermissionsGuard", () => {
  let isAllowed: jest.Mock;
  let getAllAndOverride: jest.Mock;
  let guard: PermissionsGuard;

  beforeEach(() => {
    isAllowed = jest.fn();
    getAllAndOverride = jest.fn();
    const permissions = { isAllowed } as unknown as PermissionsService;
    const reflector = { getAllAndOverride } as unknown as Reflector;
    guard = new PermissionsGuard(reflector, permissions);
  });

  it("allows the request through untouched when the route declares no @RequirePermission", async () => {
    getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext(admin))).resolves.toBe(true);
    expect(isAllowed).not.toHaveBeenCalled();
  });

  it("throws Unauthorized if no adminUser is on the request (AdminJwtAuthGuard didn't run)", async () => {
    getAllAndOverride.mockReturnValue("billing.refund");
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it("allows through when PermissionsService says allowed", async () => {
    getAllAndOverride.mockReturnValue("billing.refund");
    isAllowed.mockResolvedValue(true);
    await expect(guard.canActivate(makeContext(admin))).resolves.toBe(true);
    expect(isAllowed).toHaveBeenCalledWith("billing_manager", "billing.refund");
  });

  it("throws Forbidden when PermissionsService says not allowed", async () => {
    getAllAndOverride.mockReturnValue("billing.refund");
    isAllowed.mockResolvedValue(false);
    await expect(guard.canActivate(makeContext(admin))).rejects.toThrow(ForbiddenException);
  });
});
