import { IsEnum, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { SupportTicketStatus } from "@agterra/db";

/** Query params for GET /v1/admin/support/tickets — mirrors admin-fulfillment's list-query conventions. */
export class ListAdminSupportTicketsQuery {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

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
