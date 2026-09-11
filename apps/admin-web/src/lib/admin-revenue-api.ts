/**
 * `/v1/admin/revenue/*` client — types verified against
 * `apps/api/src/admin-revenue/dto/admin-revenue.dto.ts`, not guessed at.
 * Requires `revenue.read` server-side.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export interface RevenueByTierRow {
  reportTierCode: string;
  displayName: string;
  orderCount: number;
  revenueCents: number;
}

export interface RevenueByPersonaRow {
  externalRole: string;
  activeSubscriptionCount: number;
  reportOrderCount: number;
  reportRevenueCents: number;
}

export interface AdminRevenueSummary {
  subscriptionMrrCents: number;
  reportRevenueCents: number;
  revenueByTier: RevenueByTierRow[];
  revenueByPersona: RevenueByPersonaRow[];
}

export interface RevenueTrendPoint {
  date: string;
  reportRevenueCents: number;
  newSubscriptions: number;
}

export interface HighValueTransactionRow {
  orderId: string;
  userEmail: string;
  propertyAddress: string;
  reportTierCode: string;
  pricePaidCents: number;
  createdAt: string;
}

async function throwOnError(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallback} (HTTP ${res.status})`);
}

export const adminRevenueSummaryQueryKey = ["admin-revenue", "summary"] as const;

export async function fetchAdminRevenueSummary(): Promise<AdminRevenueSummary> {
  const res = await adminAuthFetch("/api/v1/admin/revenue/summary");
  if (!res.ok) await throwOnError(res, "Failed to load revenue summary");
  return (await res.json()) as AdminRevenueSummary;
}

export const adminRevenueTrendQueryKey = (days: number) => ["admin-revenue", "trend", days] as const;

export async function fetchAdminRevenueTrend(days: number): Promise<RevenueTrendPoint[]> {
  const res = await adminAuthFetch(`/api/v1/admin/revenue/trend?days=${days}`);
  if (!res.ok) await throwOnError(res, "Failed to load revenue trend");
  const body = (await res.json()) as { points: RevenueTrendPoint[] };
  return body.points;
}

export const adminTopTransactionsQueryKey = ["admin-revenue", "top-transactions"] as const;

export async function fetchAdminTopTransactions(): Promise<HighValueTransactionRow[]> {
  const res = await adminAuthFetch("/api/v1/admin/revenue/top-transactions?limit=10");
  if (!res.ok) await throwOnError(res, "Failed to load top transactions");
  const body = (await res.json()) as { results: HighValueTransactionRow[] };
  return body.results;
}
