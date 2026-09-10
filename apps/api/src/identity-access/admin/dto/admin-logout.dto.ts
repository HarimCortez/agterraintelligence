import { IsString, MinLength } from "class-validator";

export class AdminLogoutDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
