import { IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class RevenueTrendQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  days?: number = 30;
}
