/**
 * Support API client — `GET/POST /v1/support/tickets`,
 * `GET /v1/support/tickets/:id`, `POST /v1/support/tickets/:id/messages`.
 * All require a real access token (`JwtAuthGuard`), so every call goes
 * through `authFetch`. Verified against
 * `apps/api/src/support/dto/support.dto.ts` and `support.controller.ts`.
 */
"use client";

import { authFetch } from "./auth-fetch";
import { UnauthorizedError } from "./api-errors";

export interface SupportTicketMessage {
  id: string;
  senderType: "user" | "admin";
  body: string;
  createdAt: string;
}

export interface SupportTicketSummary {
  id: string;
  subject: string;
  status: string;
  relatedReportOrderId: string | null;
  relatedPropertyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket extends SupportTicketSummary {
  messages: SupportTicketMessage[];
}

export interface SupportTicketsResponse {
  tickets: SupportTicketSummary[];
  count: number;
}

const BASE_URL = "/api/v1/support/tickets";

export const supportTicketsQueryKey = ["support-tickets"] as const;
export const supportTicketQueryKey = (id: string) => ["support-tickets", id] as const;

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(" ");
    if (typeof body.message === "string") return body.message;
  } catch {
    // Not JSON — fall through to the generic fallback.
  }
  return fallback;
}

export async function fetchSupportTickets(): Promise<SupportTicketsResponse> {
  const res = await authFetch(BASE_URL);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load support tickets (HTTP ${res.status})`);
  return (await res.json()) as SupportTicketsResponse;
}

export async function fetchSupportTicket(id: string): Promise<SupportTicket> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(id)}`);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load this ticket (HTTP ${res.status})`);
  return (await res.json()) as SupportTicket;
}

export async function createSupportTicket(input: { subject: string; body: string }): Promise<SupportTicket> {
  const res = await authFetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await parseErrorMessage(res, "Couldn't submit your ticket. Please try again."));
  return (await res.json()) as SupportTicket;
}

export async function addSupportTicketMessage(id: string, body: string): Promise<SupportTicket> {
  const res = await authFetch(`${BASE_URL}/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await parseErrorMessage(res, "Couldn't send your reply. Please try again."));
  return (await res.json()) as SupportTicket;
}
