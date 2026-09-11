import { SubscriptionPlan, SubscriptionStatus, ReportOrderStatus, ReportPriceBasis } from "@agterra/db";

/** GET /v1/admin/billing/summary */
export interface AdminBillingSummaryDto {
  /** Count of currently-active subscriptions per purchasable plan (basic/investor/professional). */
  activeSubscriptionsByPlan: Record<string, number>;
  /** Sum of active subscriptions' monthly prices, per `subscription-plans.catalog.ts` — the only source of truth for plan pricing (no Stripe Price objects exist). */
  monthlyRecurringRevenueCents: number;
  totalReportOrders: number;
  /** Count of report orders per `ReportOrderStatus` — surfaces stuck/failed orders at a glance. */
  reportOrdersByStatus: Record<string, number>;
  /** Sum of `pricePaidCents` across `delivered` report orders only — pending/failed orders haven't actually realized revenue. */
  totalReportRevenueCents: number;
}

export interface AdminSubscriptionRowDto {
  id: string;
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  createdAt: Date;
}

export interface ListAdminSubscriptionsResponseDto {
  results: AdminSubscriptionRowDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminReportOrderRowDto {
  id: string;
  userId: string;
  userEmail: string;
  propertyId: string;
  propertyAddress: string;
  reportTierCode: string;
  pricePaidCents: number;
  priceBasis: ReportPriceBasis;
  upgradeCreditAppliedCents: number;
  status: ReportOrderStatus;
  createdAt: Date;
}

export interface ListAdminReportOrdersResponseDto {
  results: AdminReportOrderRowDto[];
  total: number;
  limit: number;
  offset: number;
}
