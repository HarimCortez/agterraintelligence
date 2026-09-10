import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { parseDurationMs } from "./duration";

export interface SignOptions {
  secret: string;
  issuer: string;
  audience: string;
  /** e.g. "15m", "30d" — anything `parseDurationMs` accepts. */
  expiresIn: string;
}

export interface VerifyOptions {
  secret: string;
  issuer: string;
  audience: string;
}

/**
 * Plane-agnostic JWT signing/verification, shared by both the investor and
 * admin auth services. Holds no secrets itself — every call site supplies
 * its own `secret`/`issuer`/`audience`, which is what lets the investor and
 * admin planes use this one service while still never sharing a signing
 * key (ARCHITECTURE.md: "separate token issuer/audience... do not reuse the
 * same signing secret — that would collapse the isolation").
 *
 * Built directly on `jsonwebtoken` rather than `@nestjs/jwt` — deliberately:
 * `@nestjs/jwt` is a thin wrapper around this exact package, and we already
 * pass secret/issuer/audience explicitly on every call (no use for
 * `@nestjs/jwt`'s global-secret module config), so the wrapper buys nothing
 * here. It also ships ESM-only from v12 on, which this repo's CJS-based
 * Jest/ts-jest setup can't load — going straight to `jsonwebtoken` (plain
 * CommonJS) avoids that friction in both the app and its tests rather than
 * working around it.
 *
 * Refresh tokens are themselves signed JWTs (carrying `sub` + a random
 * `jti`), but the raw compact token is never persisted — only a SHA-256
 * hash of it (see `hashToken`), so a database read alone can never yield a
 * usable token.
 */
@Injectable()
export class TokenService {
  signToken(payload: Record<string, unknown>, options: SignOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        options.secret,
        {
          issuer: options.issuer,
          audience: options.audience,
          expiresIn: Math.floor(parseDurationMs(options.expiresIn) / 1000),
        },
        (err, token) => {
          if (err || !token) {
            reject(err ?? new Error("jsonwebtoken.sign returned no token"));
          } else {
            resolve(token);
          }
        },
      );
    });
  }

  /** Throws (JsonWebTokenError/TokenExpiredError) on an invalid/expired/mismatched token. */
  verifyToken<T extends object = Record<string, unknown>>(token: string, options: VerifyOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, options.secret, { issuer: options.issuer, audience: options.audience }, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as T);
        }
      });
    });
  }

  /** SHA-256 hex digest — the only form of a refresh token that ever touches the database. */
  hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }
}
