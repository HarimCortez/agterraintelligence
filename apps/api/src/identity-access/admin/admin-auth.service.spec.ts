import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokenService } from "../tokens/token.service";
import { AdminAuthService } from "./admin-auth.service";
import { MfaRequiredException } from "./mfa-required.exception";
import { MfaService } from "./mfa.service";

const TEST_CONFIG = {
  JWT_ADMIN_ACCESS_SECRET: "admin-access-secret",
  JWT_ADMIN_REFRESH_SECRET: "admin-refresh-secret",
  JWT_ADMIN_ACCESS_TTL: "10m",
  JWT_ADMIN_REFRESH_TTL: "12h",
};

function makeAdmin(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    passwordHash: bcrypt.hashSync("super-secret-admin-pw", 4),
    internalRole: "support_agent",
    mfaSecret: null,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("AdminAuthService", () => {
  let service: AdminAuthService;
  const verifyCode = jest.fn();
  const generateCandidateSecret = jest.fn();
  const buildEnrollmentUri = jest.fn();

  const prismaMock = {
    adminUser: { findUnique: jest.fn(), update: jest.fn() },
    adminRefreshToken: {
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
        AdminAuthService,
        TokenService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: new ConfigService(TEST_CONFIG) },
        { provide: MfaService, useValue: { verifyCode, generateCandidateSecret, buildEnrollmentUri } },
      ],
    }).compile();
    service = moduleRef.get(AdminAuthService);
  });

  describe("login — not yet MFA-enrolled", () => {
    it("allows login with just a correct password when mfa_secret is null (documented MVP scope)", async () => {
      const admin = makeAdmin({ mfaSecret: null });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      prismaMock.adminRefreshToken.create.mockResolvedValue({ id: "art-1" });

      const result = await service.login({ email: admin.email, password: "super-secret-admin-pw" }, {});

      expect(result.adminUser.mfaEnrolled).toBe(false);
      expect(verifyCode).not.toHaveBeenCalled();
      expect(result.accessToken).toEqual(expect.any(String));
    });
  });

  describe("login — MFA-enrolled", () => {
    it("throws MfaRequiredException when the password is right but no totpCode is supplied", async () => {
      const admin = makeAdmin({ mfaSecret: "BASE32SECRET" });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);

      await expect(service.login({ email: admin.email, password: "super-secret-admin-pw" }, {})).rejects.toThrow(
        MfaRequiredException,
      );
      expect(prismaMock.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid totpCode without issuing tokens", async () => {
      const admin = makeAdmin({ mfaSecret: "BASE32SECRET" });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      verifyCode.mockResolvedValue(false);

      await expect(
        service.login({ email: admin.email, password: "super-secret-admin-pw", totpCode: "000000" }, {}),
      ).rejects.toThrow(MfaRequiredException);
      expect(prismaMock.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it("issues tokens once password and totpCode both check out", async () => {
      const admin = makeAdmin({ mfaSecret: "BASE32SECRET" });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      prismaMock.adminRefreshToken.create.mockResolvedValue({ id: "art-1" });
      verifyCode.mockResolvedValue(true);

      const result = await service.login(
        { email: admin.email, password: "super-secret-admin-pw", totpCode: "123456" },
        {},
      );

      expect(verifyCode).toHaveBeenCalledWith("BASE32SECRET", "123456");
      expect(result.adminUser.mfaEnrolled).toBe(true);
      expect(result.adminUser).not.toHaveProperty("mfaSecret");
      expect(result.adminUser).not.toHaveProperty("passwordHash");
    });
  });

  describe("login — bad credentials / inactive account", () => {
    it("rejects a wrong password before ever checking MFA", async () => {
      const admin = makeAdmin({ mfaSecret: "BASE32SECRET" });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      await expect(service.login({ email: admin.email, password: "wrong" }, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verifyCode).not.toHaveBeenCalled();
    });

    it("rejects a suspended admin account even with correct password", async () => {
      const admin = makeAdmin({ status: "suspended" });
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      await expect(service.login({ email: admin.email, password: "super-secret-admin-pw" }, {})).rejects.toThrow(
        "Account is not active",
      );
    });
  });

  describe("refresh", () => {
    it("rotates the admin refresh token on a valid, unexpired, unrevoked row", async () => {
      const admin = makeAdmin();
      prismaMock.adminUser.findUnique.mockResolvedValue(admin);
      prismaMock.adminRefreshToken.create.mockResolvedValueOnce({ id: "art-old" });
      const { refreshToken } = await service.login({ email: admin.email, password: "super-secret-admin-pw" }, {});

      prismaMock.adminRefreshToken.findUnique.mockResolvedValue({
        id: "art-old",
        adminUserId: admin.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1_000_000),
      });
      prismaMock.adminRefreshToken.create.mockResolvedValueOnce({ id: "art-new" });

      const result = await service.refresh({ refreshToken }, {});

      expect(result.refreshToken).not.toBe(refreshToken);
      expect(prismaMock.adminRefreshToken.update).toHaveBeenCalledWith({
        where: { id: "art-old" },
        data: { revokedAt: expect.any(Date), replacedById: "art-new" },
      });
    });
  });

  describe("MFA enrollment", () => {
    it("setupMfa returns a candidate secret without touching the database", () => {
      generateCandidateSecret.mockReturnValue("NEWSECRET");
      buildEnrollmentUri.mockReturnValue("otpauth://totp/...");

      const result = service.setupMfa({ email: "admin@example.com" });

      expect(result.secret).toBe("NEWSECRET");
      expect(buildEnrollmentUri).toHaveBeenCalledWith("admin@example.com", "NEWSECRET");
      expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
    });

    it("confirmMfaSetup persists mfaSecret only after a valid code", async () => {
      verifyCode.mockResolvedValue(true);
      prismaMock.adminUser.update.mockResolvedValue(makeAdmin({ mfaSecret: "CONFIRMEDSECRET" }));

      const result = await service.confirmMfaSetup("admin-1", { secret: "CONFIRMEDSECRET", totpCode: "123456" });

      expect(prismaMock.adminUser.update).toHaveBeenCalledWith({
        where: { id: "admin-1" },
        data: { mfaSecret: "CONFIRMEDSECRET" },
      });
      expect(result.mfaEnrolled).toBe(true);
    });

    it("confirmMfaSetup rejects a bad code and never persists the secret", async () => {
      verifyCode.mockResolvedValue(false);
      await expect(
        service.confirmMfaSetup("admin-1", { secret: "CANDIDATE", totpCode: "000000" }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
    });
  });
});
