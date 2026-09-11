import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminUser } from "@agterra/db";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { TokenService } from "../tokens/token.service";
import { parseDurationMs } from "../tokens/duration";
import { RequestMeta } from "../investor/investor.types";
import { getAdminAccessSignOptions, getAdminRefreshSignOptions } from "./admin-auth.config";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminLogoutDto } from "./dto/admin-logout.dto";
import { AdminRefreshDto } from "./dto/admin-refresh.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { toPublicAdminUser } from "./admin.serializers";
import { AdminAuthTokens, PublicAdminUser } from "./admin.types";
import { MfaRequiredException } from "./mfa-required.exception";
import { MfaService } from "./mfa.service";

interface AdminRefreshTokenPayload {
  sub: string;
  jti: string;
}

interface IssuedAdminTokenSet extends AdminAuthTokens {
  refreshTokenId: string;
}

/**
 * Admin auth plane (`admin_users` table) — fully separate from
 * `InvestorAuthService`: own JWT secret/issuer/audience (`JWT_ADMIN_*` env
 * vars), own refresh-token table (`admin_refresh_tokens`), and MFA
 * enforcement once an admin has enrolled (see `MfaService`). There is
 * deliberately no admin self-registration endpoint — `admin_users` rows are
 * provisioned out-of-band (seed script / another admin with the right
 * permission), matching the internal-personas-only model in
 * ARCHITECTURE.md/REQUIREMENTS.md (no external admin signup surface).
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(dto: AdminLoginDto, meta: RequestMeta): Promise<AdminAuthTokens> {
    // Every failure path below records a `admin.login.failed` audit entry
    // before throwing — `actorId` is set whenever a real admin_users row
    // was found (even if the password/MFA check then failed), and left
    // null only for an unrecognized email, since there's no row to
    // reference. `meta` (IP/user-agent) is included so a real login-
    // failure audit trail is actually useful for spotting brute-force
    // attempts, not just "someone failed once."
    const logFailure = (reason: string, admin: AdminUser | null) =>
      this.auditLog.record({
        actorId: admin?.id ?? null,
        actorEmail: dto.email,
        action: "admin.login.failed",
        metadata: { reason, ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null },
      });

    const admin = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    const invalidCredentials = () => new UnauthorizedException("Invalid email or password");
    if (!admin) {
      await logFailure("unknown_email", null);
      throw invalidCredentials();
    }
    const passwordOk = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordOk) {
      await logFailure("invalid_password", admin);
      throw invalidCredentials();
    }
    if (admin.status !== "active") {
      await logFailure("account_inactive", admin);
      throw new UnauthorizedException("Account is not active");
    }

    if (admin.mfaSecret) {
      if (!dto.totpCode) {
        await logFailure("mfa_required", admin);
        throw new MfaRequiredException();
      }
      const codeOk = await this.mfa.verifyCode(admin.mfaSecret, dto.totpCode);
      if (!codeOk) {
        await logFailure("invalid_mfa_code", admin);
        throw new MfaRequiredException("Invalid MFA code");
      }
    }
    // else: not yet enrolled — allowed through for now. See MfaService's
    // scope note; a product decision is needed on hard-gating this.

    const issued = await this.issueTokens(admin, meta);
    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "admin.login.success",
      metadata: { ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null },
    });
    return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, adminUser: issued.adminUser };
  }

  async refresh(dto: AdminRefreshDto, meta: RequestMeta): Promise<AdminAuthTokens> {
    let payload: AdminRefreshTokenPayload;
    try {
      payload = await this.tokens.verifyToken<AdminRefreshTokenPayload>(
        dto.refreshToken,
        getAdminRefreshSignOptions(this.config),
      );
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const tokenHash = this.tokens.hashToken(dto.refreshToken);
    const stored = await this.prisma.adminRefreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.adminUserId !== payload.sub) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (stored.revokedAt) {
      await this.revokeAllForAdmin(stored.adminUserId);
      throw new UnauthorizedException("Refresh token has already been used");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: stored.adminUserId } });
    if (!admin || admin.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    const issued = await this.issueTokens(admin, meta);
    await this.prisma.adminRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: issued.refreshTokenId },
    });
    return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, adminUser: issued.adminUser };
  }

  async logout(dto: AdminLogoutDto): Promise<void> {
    const tokenHash = this.tokens.hashToken(dto.refreshToken);
    await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Step 1 of enrollment: generate a candidate secret. Deliberately NOT
   * persisted yet — the caller must round-trip it through `confirmMfaSetup`
   * with a valid code first, so a botched scan/typo can't silently lock an
   * admin out of their own account with an unconfirmed secret in the
   * database. Requires an authenticated admin session (see
   * `AdminAuthController`).
   */
  setupMfa(adminUser: { email: string }): { secret: string; otpauthUri: string } {
    const secret = this.mfa.generateCandidateSecret();
    return { secret, otpauthUri: this.mfa.buildEnrollmentUri(adminUser.email, secret) };
  }

  /** Step 2 of enrollment: confirm a code against the candidate secret from `setupMfa`, then persist it. */
  async confirmMfaSetup(adminUserId: string, dto: MfaVerifyDto): Promise<PublicAdminUser> {
    const codeOk = await this.mfa.verifyCode(dto.secret, dto.totpCode);
    if (!codeOk) {
      throw new BadRequestException("Invalid MFA code — enrollment not confirmed");
    }
    const admin = await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: { mfaSecret: dto.secret },
    });
    return toPublicAdminUser(admin);
  }

  private async issueTokens(admin: AdminUser, meta: RequestMeta): Promise<IssuedAdminTokenSet> {
    const accessOptions = getAdminAccessSignOptions(this.config);
    const refreshOptions = getAdminRefreshSignOptions(this.config);

    const accessToken = await this.tokens.signToken(
      { sub: admin.id, email: admin.email, role: admin.internalRole },
      accessOptions,
    );
    const refreshToken = await this.tokens.signToken({ sub: admin.id, jti: randomUUID() }, refreshOptions);

    const created = await this.prisma.adminRefreshToken.create({
      data: {
        adminUserId: admin.id,
        tokenHash: this.tokens.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshOptions.expiresIn)),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      adminUser: toPublicAdminUser(admin),
    };
  }

  private async revokeAllForAdmin(adminUserId: string): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
