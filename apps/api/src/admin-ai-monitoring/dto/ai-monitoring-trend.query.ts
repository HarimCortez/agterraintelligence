import { IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class AiMonitoringTrendQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  days?: number = 14;
}
