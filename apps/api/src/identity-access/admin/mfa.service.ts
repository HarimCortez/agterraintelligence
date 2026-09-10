import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";

const TOTP_ISSUER = "AgTerra Intelligence";

/**
 * TOTP (RFC 6238) wrapper for admin MFA, per ARCHITECTURE.md's "MFA-
 * required" admin session policy and the `admin_users.mfa_secret` column.
 *
 * Uses otplib's classic `authenticator` API (pinned to the 12.x major, a
 * deliberate choice over the newer 13.x functional API — 13.x's
 * `@otplib/plugin-base32-scure` dependency ships ESM-only source with no
 * CJS build, which this repo's CJS-based Jest/ts-jest setup can't load;
 * 12.x is fully CommonJS end to end and behaviorally equivalent for our
 * purposes — see this module's spec file).
 *
 * Scope note: this implements the verification primitive and a minimal
 * enrollment handshake (generate a candidate secret → confirm one code
 * against it → persist), which is enough for the backend to be fully
 * functional end to end. What's explicitly NOT built here (out of scope
 * for this backend pass, see root CLAUDE.md's Authentication section):
 * QR-code rendering (client-side concern — the otpauth:// URI is enough for
 * any authenticator app or a QR library to consume), recovery/backup codes,
 * and forced-enrollment gating (today an admin with no `mfa_secret` yet can
 * still log in with just a password — see `AdminAuthService.login`; a
 * product decision is needed on whether first login should hard-require
 * enrollment before this ships to real admins).
 */
@Injectable()
export class MfaService {
  constructor() {
    // 1 step (~30s) of tolerance each way, to absorb minor clock drift
    // between server and authenticator app without materially widening the
    // guessable window.
    authenticator.options = { window: 1 };
  }

  /** A fresh base32 secret — NOT yet persisted. Caller must confirm a code against it (`verifyCode`) before saving it to `admin_users.mfa_secret`. */
  generateCandidateSecret(): string {
    return authenticator.generateSecret();
  }

  /** `otpauth://` URI an authenticator app (or a QR-code library on the client) can consume directly. */
  buildEnrollmentUri(email: string, secret: string): string {
    return authenticator.keyuri(email, TOTP_ISSUER, secret);
  }

  verifyCode(secret: string, code: string): Promise<boolean> {
    return Promise.resolve(authenticator.verify({ token: code, secret }));
  }
}
