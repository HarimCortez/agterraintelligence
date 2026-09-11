import { ReportOrderStatus, SupportTicketStatus } from "@agterra/db";

export interface AdminSupportTicketSummaryDto {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  userEmail: string;
  assignedAdminEmail: string | null;
  relatedReportOrderId: string | null;
  relatedPropertyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAdminSupportTicketsResponseDto {
  results: AdminSupportTicketSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSupportMessageDto {
  id: string;
  senderType: "user" | "admin";
  senderEmail: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: Date;
}

/** Minimal context a Support Agent needs without leaving the ticket screen — not a full user/order/property detail endpoint. */
export interface TicketUserContextDto {
  id: string;
  email: string;
  externalRole: string;
  status: string;
}

export interface TicketReportOrderContextDto {
  id: string;
  status: ReportOrderStatus;
  reportTierCode: string;
  pricePaidCents: number;
  hasPaymentToRefund: boolean;
  createdAt: Date;
}

export interface TicketPropertyContextDto {
  id: string;
  address: string;
  county: string;
}

export interface AdminSupportTicketDetailDto extends AdminSupportTicketSummaryDto {
  messages: AdminSupportMessageDto[];
  user: TicketUserContextDto;
  relatedReportOrder: TicketReportOrderContextDto | null;
  relatedProperty: TicketPropertyContextDto | null;
}

export interface RefundTicketOrderResponseDto {
  reportOrderId: string;
  stripeRefundId: string;
  status: ReportOrderStatus;
}
