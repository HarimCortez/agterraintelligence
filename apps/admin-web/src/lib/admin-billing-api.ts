/**
 * `/v1/admin/billing/*` client — types verified against
 * `apps/api/src/admin-billing/dto/admin-billing.dto.ts` and the query DTOs
 * in that same directory, not guessed at. Every call requires `billing.read`
 * server-side (`PermissionsGuard`) — a 403 here means "logged in, but this
 * role isn't permitted," distinct from a 401 ("not logged in at all"), so
 * both are parsed and thrown as distinct error types.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export interface AdminBillingSummary {
  activeSubscriptionsByPlan: Record<string, number>;
  monthlyRecurringRevenueCents: number;
  totalReportOrders: number;
  reportOrdersByStatus: Record<string, number>;
  totalReportRevenueCents: number;
}

export interface AdminSubscriptionRow {
  id: string;
  userId: string;
  userEmail: string;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
}

export interface AdminReportOrderRow {
  id: string;
  userId: string;
  userEmail: string;
  propertyId: string;
  propertyAddress: string;
  reportTierCode: string;
  pricePaidCents: number;
  priceBasis: string;
  upgradeCreditAppliedCents: number;
  status: string;
  createdAt: string;
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

export const adminBillingSummaryQueryKey = ["admin-billing", "summary"] as const;

export async function fetchAdminBillingSummary(): Promise<AdminBillingSummary> {
  const res = await adminAuthFetch("/api/v1/admin/billing/summary");
  if (!res.ok) await throwOnError(res, "Failed to load billing summary");
  return (await res.json()) as AdminBillingSummary;
}

export interface ListSubscriptionsParams {
  plan?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export const adminSubscriptionsQueryKey = (params: ListSubscriptionsParams) =>
  ["admin-billing", "subscriptions", params] as const;

export async function fetchAdminSubscriptions(params: ListSubscriptionsParams): Promise<Paginated<AdminSubscriptionRow>> {
  const search = new URLSearchParams();
  if (params.plan) search.set("plan", params.plan);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/billing/subscriptions?${search.toString()}`);
  if (!res.ok) await throwOnError(res, "Failed to load subscriptions");
  return (await res.json()) as Paginated<AdminSubscriptionRow>;
}

export interface ListReportOrdersParams {
  status?: string;
  reportTierCode?: string;
  limit?: number;
  offset?: number;
}

export const adminReportOrdersQueryKey = (params: ListReportOrdersParams) =>
  ["admin-billing", "report-orders", params] as const;

export async function fetchAdminReportOrders(params: ListReportOrdersParams): Promise<Paginated<AdminReportOrderRow>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.reportTierCode) search.set("reportTierCode", params.reportTierCode);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/billing/report-orders?${search.toString()}`);
  if (!res.ok) await throwOnError(res, "Failed to load report orders");
  return (await res.json()) as Paginated<AdminReportOrderRow>;
}
