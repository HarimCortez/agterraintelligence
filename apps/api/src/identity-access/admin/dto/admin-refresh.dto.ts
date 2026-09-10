import { IsString, MinLength } from "class-validator";

export class AdminRefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
