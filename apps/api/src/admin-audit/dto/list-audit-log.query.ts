import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/** Query params for GET /v1/admin/audit/entries. `action` is an exact match (see AuditLogEntry's free-string convention); `actorEmail` is a case-insensitive substring match, for searching without knowing the exact address. */
export class ListAuditLogQuery {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actorEmail?: string;

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
