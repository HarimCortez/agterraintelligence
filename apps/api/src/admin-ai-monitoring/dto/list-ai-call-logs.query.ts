import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { AiCallStatus } from "@agterra/db";

export class ListAiCallLogsQuery {
  @IsOptional()
  @IsEnum(AiCallStatus)
  status?: AiCallStatus;

  @IsOptional()
  @IsString()
  feature?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}
