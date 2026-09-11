import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

/**
 * Request DTO for POST /v1/support/tickets. `relatedReportOrderId` and
 * `relatedPropertyId` are both optional and independent — see
 * `SupportTicket`'s schema comment.
 */
export class CreateTicketDto {
  @IsString({ message: "subject must be a string" })
  @MinLength(1, { message: "subject must not be empty" })
  @MaxLength(200, { message: "subject must be at most 200 characters" })
  subject!: string;

  @IsString({ message: "body must be a string" })
  @MinLength(1, { message: "body must not be empty" })
  @MaxLength(5000, { message: "body must be at most 5000 characters" })
  body!: string;

  @IsOptional()
  @IsUUID(undefined, { message: "relatedReportOrderId must be a valid UUID" })
  relatedReportOrderId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: "relatedPropertyId must be a valid UUID" })
  relatedPropertyId?: string;
}

/** Request DTO for POST /v1/support/tickets/:id/messages. */
export class CreateTicketMessageDto {
  @IsString({ message: "body must be a string" })
  @MinLength(1, { message: "body must not be empty" })
  @MaxLength(5000, { message: "body must be at most 5000 characters" })
  body!: string;
}

/**
 * Investor-facing message shape — `isInternalNote` rows are never returned
 * here at all (filtered server-side), not merely hidden client-side.
 */
export class SupportTicketMessageDto {
  id!: string;
  senderType!: "user" | "admin";
  body!: string;
  createdAt!: Date;
}

export class SupportTicketSummaryDto {
  id!: string;
  subject!: string;
  status!: string;
  relatedReportOrderId!: string | null;
  relatedPropertyId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class SupportTicketDto extends SupportTicketSummaryDto {
  messages!: SupportTicketMessageDto[];
}

export class GetSupportTicketsResponseDto {
  tickets!: SupportTicketSummaryDto[];
  count!: number;
}
