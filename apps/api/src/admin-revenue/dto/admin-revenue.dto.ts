import { ExternalRole } from "@agterra/db";

export interface RevenueByTierRow {
  reportTierCode: string;
  displayName: string;
  orderCount: number;
  revenueCents: number;
}

export interface RevenueByPersonaRow {
  externalRole: ExternalRole;
  activeSubscriptionCount: number;
  reportOrderCount: number;
  reportRevenueCents: number;
}

/** GET /v1/admin/revenue/summary */
export interface AdminRevenueSummaryDto {
  subscriptionMrrCents: number;
  /** Sum of `pricePaidCents` across `delivered` report orders only — realized revenue, not orders still in flight. */
  reportRevenueCents: number;
  revenueByTier: RevenueByTierRow[];
  revenueByPersona: RevenueByPersonaRow[];
}

export interface RevenueTrendPoint {
  /** ISO date (YYYY-MM-DD), UTC day bucket. */
  date: string;
  reportRevenueCents: number;
  newSubscriptions: number;
}

/** GET /v1/admin/revenue/trend */
export interface RevenueTrendResponseDto {
  points: RevenueTrendPoint[];
}

export interface HighValueTransactionRow {
  orderId: string;
  userEmail: string;
  propertyAddress: string;
  reportTierCode: string;
  pricePaidCents: number;
  createdAt: Date;
}

/** GET /v1/admin/revenue/top-transactions */
export interface TopTransactionsResponseDto {
  results: HighValueTransactionRow[];
}
