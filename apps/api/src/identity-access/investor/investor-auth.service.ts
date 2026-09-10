import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { User } from "@agterra/db";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TokenService } from "../tokens/token.service";
import { parseDurationMs } from "../tokens/duration";
import { getInvestorAccessSignOptions, getInvestorRefreshSignOptions } from "./investor-auth.config";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { toPublicUser } from "./investor.serializers";
import { AuthTokens, PublicUser, RequestMeta } from "./investor.types";

/** bcrypt cost factor. 12 is a reasonable MVP default (~250ms/hash on modern hardware). */
const BCRYPT_SALT_ROUNDS = 12;

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

interface IssuedTokenSet extends AuthTokens {
  refreshTokenId: string;
}

/**
 * Investor auth plane (`users` table). Fully separate from `AdminAuthService`
 * — separate JWT secret/issuer/audience (read from `JWT_INVESTOR_*` env
 * vars, never shared with `JWT_ADMIN_*`), separate refresh-token table
 * (`refresh_tokens`, not `admin_refresh_tokens`). This is the deliberate
 * blast-radius isolation ARCHITECTURE.md calls for between the two planes.
 */
@Injectable()
export class InvestorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a `users` row and returns the public shape — no tokens issued
   * here. Registration and login are kept as separate calls (REST-y:
   * register creates the resource, login creates the session) so the
   * client explicitly authenticates once the account exists.
   *
   * Email verification is out of scope for this pass (separate work item —
   * see root CLAUDE.md's Authentication section). The schema's default
   * status is `pending_verification`, which would leave every account
   * permanently unable to log in with no verification flow to unstick it —
   * so this sets `active` directly for now. When the verification flow is
   * built, change this back to the schema default and let that flow own
   * the transition to `active`.
   */
  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: "active",
      },
    });
    return toPublicUser(user);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same generic message whether the email doesn't exist or the password
    // is wrong — don't let login responses be used to enumerate accounts.
    const invalidCredentials = () => new UnauthorizedException("Invalid email or password");
    if (!user) {
      throw invalidCredentials();
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw invalidCredentials();
    }
    if (user.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }
    const issued = await this.issueTokens(user, meta);
    return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, user: issued.user };
  }

  async refresh(dto: RefreshDto, meta: RequestMeta): Promise<AuthTokens> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.tokens.verifyToken<RefreshTokenPayload>(dto.refreshToken, getInvestorRefreshSignOptions(this.config));
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const tokenHash = this.tokens.hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (stored.revokedAt) {
      // Presenting an already-rotated/revoked token is a signal the token
      // was stolen and used out of order — revoke the whole chain for this
      // user as a precaution rather than trusting it.
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException("Refresh token has already been used");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token has expired");
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    const issued = await this.issueTokens(user, meta);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: issued.refreshTokenId },
    });
    return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, user: issued.user };
  }

  /** Idempotent: an unknown or already-revoked token is treated as "already logged out", not an error — avoids leaking which tokens exist. */
  async logout(dto: LogoutDto): Promise<void> {
    const tokenHash = this.tokens.hashToken(dto.refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User, meta: RequestMeta): Promise<IssuedTokenSet> {
    const accessOptions = getInvestorAccessSignOptions(this.config);
    const refreshOptions = getInvestorRefreshSignOptions(this.config);

    const accessToken = await this.tokens.signToken(
      { sub: user.id, email: user.email, role: user.externalRole },
      accessOptions,
    );
    const refreshToken = await this.tokens.signToken({ sub: user.id, jti: randomUUID() }, refreshOptions);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.tokens.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshOptions.expiresIn)),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken, refreshTokenId: created.id, user: toPublicUser(user) };
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
