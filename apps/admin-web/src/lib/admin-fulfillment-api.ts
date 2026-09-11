/**
 * `/v1/admin/fulfillment/*` client — types verified against
 * `apps/api/src/admin-report-fulfillment/dto/admin-fulfillment.dto.ts`, not
 * guessed at. Reads require `fulfillment.read`; retry requires the
 * narrower `fulfillment.retry` (see that controller's doc comment) — a
 * 403 on retry specifically (not on the page's reads) means "you can see
 * this order but your role can't retry it," a real distinct case worth
 * surfacing differently than a blanket page-level Forbidden state.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export interface AdminFulfillmentSummary {
  ordersByStatus: Record<string, number>;
  averageFulfillmentSeconds: number | null;
  failedOrderCount: number;
}

export interface AdminFulfillmentOrderRow {
  id: string;
  userEmail: string;
  propertyId: string;
  propertyAddress: string;
  reportTierCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  hasContent: boolean;
}

export interface AdminFulfillmentOrderDetail extends AdminFulfillmentOrderRow {
  pricePaidCents: number;
  priceBasis: string;
  content: unknown;
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

async function throwOnError(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallback} (HTTP ${res.status})`);
}

export const adminFulfillmentSummaryQueryKey = ["admin-fulfillment", "summary"] as const;

export async function fetchAdminFulfillmentSummary(): Promise<AdminFulfillmentSummary> {
  const res = await adminAuthFetch("/api/v1/admin/fulfillment/summary");
  if (!res.ok) await throwOnError(res, "Failed to load fulfillment summary");
  return (await res.json()) as AdminFulfillmentSummary;
}

export interface ListFulfillmentOrdersParams {
  status?: string;
  reportTierCode?: string;
  limit?: number;
  offset?: number;
}

export const adminFulfillmentOrdersQueryKey = (params: ListFulfillmentOrdersParams) =>
  ["admin-fulfillment", "orders", params] as const;

export async function fetchAdminFulfillmentOrders(
  params: ListFulfillmentOrdersParams,
): Promise<Paginated<AdminFulfillmentOrderRow>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.reportTierCode) search.set("reportTierCode", params.reportTierCode);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/fulfillment/orders?${search.toString()}`);
  if (!res.ok) await throwOnError(res, "Failed to load report orders");
  return (await res.json()) as Paginated<AdminFulfillmentOrderRow>;
}

export const adminFulfillmentOrderDetailQueryKey = (id: string) => ["admin-fulfillment", "order", id] as const;

export async function fetchAdminFulfillmentOrderDetail(id: string): Promise<AdminFulfillmentOrderDetail> {
  const res = await adminAuthFetch(`/api/v1/admin/fulfillment/orders/${encodeURIComponent(id)}`);
  if (!res.ok) await throwOnError(res, "Failed to load order detail");
  return (await res.json()) as AdminFulfillmentOrderDetail;
}

export async function retryFulfillmentOrder(id: string): Promise<{ id: string; status: string }> {
  const res = await adminAuthFetch(`/api/v1/admin/fulfillment/orders/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });
  if (!res.ok) await throwOnError(res, "Failed to retry order");
  return (await res.json()) as { id: string; status: string };
}
