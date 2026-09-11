/**
 * `/v1/admin/support/*` client — types verified against
 * `apps/api/src/admin-support/dto/admin-support.dto.ts`, not guessed at.
 * Requires `support.read` for reads, `support.respond` for replies/notes/
 * status changes, `support.refund` for the refund action.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface AdminSupportTicketSummary {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  userEmail: string;
  assignedAdminEmail: string | null;
  relatedReportOrderId: string | null;
  relatedPropertyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSupportMessage {
  id: string;
  senderType: "user" | "admin";
  senderEmail: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface TicketUserContext {
  id: string;
  email: string;
  externalRole: string;
  status: string;
}

export interface TicketReportOrderContext {
  id: string;
  status: string;
  reportTierCode: string;
  pricePaidCents: number;
  hasPaymentToRefund: boolean;
  createdAt: string;
}

export interface TicketPropertyContext {
  id: string;
  address: string;
  county: string;
}

export interface AdminSupportTicketDetail extends AdminSupportTicketSummary {
  messages: AdminSupportMessage[];
  user: TicketUserContext;
  relatedReportOrder: TicketReportOrderContext | null;
  relatedProperty: TicketPropertyContext | null;
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListAdminSupportTicketsParams {
  status?: SupportTicketStatus;
  limit?: number;
  offset?: number;
}

export const adminSupportTicketsQueryKey = (params: ListAdminSupportTicketsParams) =>
  ["admin-support", "tickets", params] as const;
export const adminSupportTicketQueryKey = (id: string) => ["admin-support", "tickets", id] as const;

async function handleErrorResponse(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  const message = await parseErrorMessage(res, fallback);
  throw new Error(message);
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // Not JSON — fall through to the generic fallback.
  }
  return `${fallback} (HTTP ${res.status})`;
}

export async function fetchAdminSupportTickets(
  params: ListAdminSupportTicketsParams,
): Promise<Paginated<AdminSupportTicketSummary>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/support/tickets?${search.toString()}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load support tickets");
  return (await res.json()) as Paginated<AdminSupportTicketSummary>;
}

export async function fetchAdminSupportTicket(id: string): Promise<AdminSupportTicketDetail> {
  const res = await adminAuthFetch(`/api/v1/admin/support/tickets/${encodeURIComponent(id)}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load this ticket");
  return (await res.json()) as AdminSupportTicketDetail;
}

export async function addAdminSupportMessage(
  id: string,
  input: { body: string; isInternalNote: boolean },
): Promise<AdminSupportTicketDetail> {
  const res = await adminAuthFetch(`/api/v1/admin/support/tickets/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return handleErrorResponse(res, "Failed to send message");
  return (await res.json()) as AdminSupportTicketDetail;
}

export async function updateAdminSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
): Promise<AdminSupportTicketDetail> {
  const res = await adminAuthFetch(`/api/v1/admin/support/tickets/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return handleErrorResponse(res, "Failed to update ticket status");
  return (await res.json()) as AdminSupportTicketDetail;
}

export async function refundAdminSupportTicketOrder(
  id: string,
): Promise<{ reportOrderId: string; stripeRefundId: string; status: string }> {
  const res = await adminAuthFetch(`/api/v1/admin/support/tickets/${encodeURIComponent(id)}/refund`, {
    method: "POST",
  });
  if (!res.ok) return handleErrorResponse(res, "Failed to issue refund");
  return (await res.json()) as { reportOrderId: string; stripeRefundId: string; status: string };
}
