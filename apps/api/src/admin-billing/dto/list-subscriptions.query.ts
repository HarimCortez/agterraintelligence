import { IsEnum, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { SubscriptionPlan, SubscriptionStatus } from "@agterra/db";

/** Query params for GET /v1/admin/billing/subscriptions — mirrors ListPropertiesQuery's conventions. */
export class ListAdminSubscriptionsQuery {
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

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
