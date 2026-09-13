import { IsBoolean } from "class-validator";

export class UpdatePermissionDto {
  @IsBoolean()
  allowed!: boolean;
}
