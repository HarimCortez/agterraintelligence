import { IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class TopTransactionsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
