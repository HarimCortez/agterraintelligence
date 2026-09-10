import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokenService } from "../tokens/token.service";
import { InvestorAuthService } from "./investor-auth.service";

const TEST_CONFIG = {
  JWT_INVESTOR_ACCESS_SECRET: "investor-access-secret",
  JWT_INVESTOR_REFRESH_SECRET: "investor-refresh-secret",
  JWT_INVESTOR_ACCESS_TTL: "15m",
  JWT_INVESTOR_REFRESH_TTL: "30d",
};

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "investor@example.com",
    passwordHash: bcrypt.hashSync("correct-horse-battery-staple", 4),
    externalRole: "free",
    orgId: null,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("InvestorAuthService", () => {
  let service: InvestorAuthService;

  const prismaMock = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvestorAuthService,
        TokenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: new ConfigService(TEST_CONFIG) },
      ],
    }).compile();
    service = moduleRef.get(InvestorAuthService);
  });

  describe("register", () => {
    it("hashes the password and never returns it, even implicitly", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const created = makeUser({ id: "user-2", email: "new@example.com" });
      prismaMock.user.create.mockResolvedValue(created);

      const result = await service.register({ email: "new@example.com", password: "correct-horse-battery-staple" });

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "new@example.com", status: "active" }),
        }),
      );
      // The hash actually passed to Prisma must not be the plaintext password.
      const passedData = prismaMock.user.create.mock.calls[0][0].data;
      expect(passedData.passwordHash).not.toBe("correct-horse-battery-staple");
      expect(await bcrypt.compare("correct-horse-battery-staple", passedData.passwordHash)).toBe(true);

      // The returned DTO has no password field of any kind.
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("passwordHash");
      expect(result.email).toBe("new@example.com");
    });

    it("rejects a duplicate email with 409, without hashing/creating anything", async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser());
      await expect(
        service.register({ email: "investor@example.com", password: "correct-horse-battery-staple" }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("issues an access+refresh token pair and persists a refresh_tokens row on success", async () => {
      const user = makeUser();
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.refreshToken.create.mockResolvedValue({ id: "rt-1" });

      const result = await service.login(
        { email: user.email, password: "correct-horse-battery-staple" },
        { userAgent: "jest", ipAddress: "127.0.0.1" },
      );

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prismaMock.refreshToken.create.mock.calls[0][0].data;
      expect(createArgs.userId).toBe(user.id);
      // Only a hash is ever persisted — never the raw refresh token string.
      expect(createArgs.tokenHash).not.toBe(result.refreshToken);
      expect(createArgs.tokenHash).toHaveLength(64);
    });

    it("rejects a wrong password with a generic message (no account enumeration)", async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.login({ email: "investor@example.com", password: "wrong" }, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it("gives the same generic error for an unknown email as for a wrong password", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      let unknownEmailMessage = "";
      try {
        await service.login({ email: "nobody@example.com", password: "whatever" }, {});
      } catch (err) {
        unknownEmailMessage = (err as UnauthorizedException).message;
      }

      prismaMock.user.findUnique.mockResolvedValue(makeUser());
      let wrongPasswordMessage = "";
      try {
        await service.login({ email: "investor@example.com", password: "wrong" }, {});
      } catch (err) {
        wrongPasswordMessage = (err as UnauthorizedException).message;
      }

      expect(unknownEmailMessage).toBe(wrongPasswordMessage);
    });

    it("rejects login for a non-active account", async () => {
      prismaMock.user.findUnique.mockResolvedValue(makeUser({ status: "suspended" }));
      await expect(
        service.login({ email: "investor@example.com", password: "correct-horse-battery-staple" }, {}),
      ).rejects.toThrow("Account is not active");
    });
  });

  describe("refresh", () => {
    it("rotates the token: revokes the old row and links replacedById to the newly issued one", async () => {
      const user = makeUser();
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.refreshToken.create.mockResolvedValue({ id: "rt-new" });

      // First, issue a real refresh token via login so refresh() has something valid to verify.
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-old" });
      const { refreshToken } = await service.login(
        { email: user.email, password: "correct-horse-battery-staple" },
        {},
      );
      const tokenHash = (service as unknown as { tokens: TokenService }).tokens.hashToken(refreshToken);

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "rt-old",
        userId: user.id,
        tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1_000_000),
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-new" });

      const result = await service.refresh({ refreshToken }, {});

      expect(result.refreshToken).not.toBe(refreshToken);
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-old" },
        data: { revokedAt: expect.any(Date), replacedById: "rt-new" },
      });
    });

    it("rejects and revokes the whole chain when a revoked (already-used) token is replayed", async () => {
      const user = makeUser();
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-1" });
      const { refreshToken } = await service.login(
        { email: user.email, password: "correct-horse-battery-staple" },
        {},
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: user.id,
        tokenHash: "irrelevant-since-mocked-lookup",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1_000_000),
      });

      await expect(service.refresh({ refreshToken }, {})).rejects.toThrow("already been used");
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("rejects a syntactically invalid / wrongly-signed refresh token outright", async () => {
      await expect(service.refresh({ refreshToken: "not-a-real-jwt" }, {})).rejects.toThrow(
        "Invalid or expired refresh token",
      );
    });

    it("rejects an expired stored token even if the JWT itself hasn't hit its own exp yet", async () => {
      const user = makeUser();
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-1" });
      const { refreshToken } = await service.login(
        { email: user.email, password: "correct-horse-battery-staple" },
        {},
      );

      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        userId: user.id,
        tokenHash: "irrelevant",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1_000), // already expired row
      });

      await expect(service.refresh({ refreshToken }, {})).rejects.toThrow("expired");
    });
  });

  describe("logout", () => {
    it("revokes the matching un-revoked row and is idempotent for an unknown token", async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout({ refreshToken: "some-token" });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.logout({ refreshToken: "unknown-token" })).resolves.toBeUndefined();
    });
  });
});
