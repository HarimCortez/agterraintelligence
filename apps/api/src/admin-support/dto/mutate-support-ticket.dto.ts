import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SupportTicketStatus } from "@agterra/db";

export class AddAdminSupportMessageDto {
  @IsString({ message: "body must be a string" })
  @MinLength(1, { message: "body must not be empty" })
  @MaxLength(5000, { message: "body must be at most 5000 characters" })
  body!: string;

  /** false (default) = a reply the ticket's user can see. true = an admin-only internal note. */
  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean = false;
}

export class UpdateSupportTicketStatusDto {
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}
