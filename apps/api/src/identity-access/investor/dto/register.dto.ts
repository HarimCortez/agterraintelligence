import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt/bcryptjs silently ignore bytes past 72 — cap here so the
  // truncation boundary is an explicit validation error, not a silent
  // password-strength surprise.
  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  password!: string;
}
