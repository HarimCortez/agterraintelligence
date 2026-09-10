import { IsString, Length, MinLength } from "class-validator";

/** Confirms a candidate TOTP secret (returned by `POST /v1/admin/auth/mfa/setup`) before it is persisted to `admin_users.mfa_secret`. */
export class MfaVerifyDto {
  @IsString()
  @MinLength(1)
  secret!: string;

  @IsString()
  @Length(6, 6)
  totpCode!: string;
}
