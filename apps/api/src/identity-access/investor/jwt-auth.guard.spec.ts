import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokenService } from "../tokens/token.service";
import { getInvestorAccessSignOptions } from "./investor-auth.config";
import { JwtAuthGuard } from "./jwt-auth.guard";

const TEST_CONFIG = {
  JWT_INVESTOR_ACCESS_SECRET: "investor-access-secret",
  JWT_INVESTOR_REFRESH_SECRET: "investor-refresh-secret",
};

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let tokens: TokenService;
  const findUnique = jest.fn();
  const config = new ConfigService(TEST_CONFIG);

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        TokenService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: { user: { findUnique } } },
      ],
    }).compile();
    guard = moduleRef.get(JwtAuthGuard);
    tokens = moduleRef.get(TokenService);
  });

  it("rejects a request with no Authorization header", async () => {
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a token signed with the wrong (e.g. admin) secret", async () => {
    const foreignToken = await tokens.signToken(
      { sub: "user-1" },
      { secret: "admin-access-secret", issuer: "agterra-investor-auth", audience: "agterra-investor", expiresIn: "15m" },
    );
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: `Bearer ${foreignToken}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("attaches req.user (id/email/externalRole/orgId/status) for a valid token and active user", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, getInvestorAccessSignOptions(config));
    findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      externalRole: "investor_subscriber",
      orgId: null,
      status: "active",
      passwordHash: "should-never-be-read-by-the-guard",
    });

    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: "user-1",
      email: "u@example.com",
      externalRole: "investor_subscriber",
      orgId: null,
      status: "active",
    });
    expect(request.user).not.toHaveProperty("passwordHash");
  });

  it("rejects when the user no longer exists", async () => {
    const token = await tokens.signToken({ sub: "ghost" }, getInvestorAccessSignOptions(config));
    findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a suspended user even with a validly signed, unexpired token", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, getInvestorAccessSignOptions(config));
    findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      externalRole: "free",
      orgId: null,
      status: "suspended",
    });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow("Account is not active");
  });
});
