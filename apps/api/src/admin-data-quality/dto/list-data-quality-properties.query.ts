import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ValuationConfidence } from "@agterra/db";
import { DataQualityIssue } from "./admin-data-quality.dto";

const ISSUE_VALUES: DataQualityIssue[] = [
  "missing_valuation",
  "missing_score",
  "possible_duplicate",
  "has_risk_flags",
];

export class ListDataQualityPropertiesQuery {
  @IsOptional()
  @IsEnum(ValuationConfidence)
  confidence?: ValuationConfidence;

  @IsOptional()
  @IsIn(ISSUE_VALUES)
  issue?: DataQualityIssue;

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
