import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ReportOrderStatus } from "@agterra/db";

/** Query params for GET /v1/admin/fulfillment/orders — mirrors admin-billing's list-query conventions. */
export class ListAdminFulfillmentOrdersQuery {
  @IsOptional()
  @IsEnum(ReportOrderStatus)
  status?: ReportOrderStatus;

  @IsOptional()
  @IsString()
  reportTierCode?: string;

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
