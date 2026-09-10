import { IsEmail, IsOptional, IsString, Length, MinLength } from "class-validator";

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Required only once the admin has enrolled MFA (`admin_users.mfa_secret` is set) — see `AdminAuthService.login`. */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string;
}
