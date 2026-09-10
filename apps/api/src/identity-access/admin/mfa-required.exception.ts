import { UnauthorizedException } from "@nestjs/common";

/**
 * Thrown by `AdminAuthService.login` when the password check passed but the
 * account has MFA enrolled and no (or an invalid) `totpCode` was supplied.
 * Distinct from a plain bad-credentials 401 so the admin console can tell
 * "re-prompt for a TOTP code" apart from "the password was wrong" — check
 * `error` in the response body, not just the 401 status.
 */
export class MfaRequiredException extends UnauthorizedException {
  constructor(message = "A valid MFA code is required to complete login") {
    super({ error: "mfa_required", message });
  }
}
