/**
 * Report tier / report order API client — `GET /v1/report-tiers` (public),
 * `GET /v1/properties/:id/reports/pricing`, `GET /v1/properties/:id/reports`,
 * `POST /v1/properties/:id/reports/checkout`, `GET /v1/report-orders/:id`
 * (all four authenticated). Shapes verified directly against
 * `apps/api/src/monetization/dto/monetization-response.dto.ts` and the real
 * controllers/services, not guessed at.
 */
"use client";

import { authFetch } from "./auth-fetch";
import { UnauthorizedError } from "./api-errors";

export type ReportTierCode = "essential" | "investor" | "professional" | "premium";

/** GET /v1/report-tiers — public, all four seeded tiers, sorted by sortOrder. */
export interface ReportTier {
  code: string;
  displayName: string;
  subscriberPriceCents: number;
  nonSubscriberPriceCents: number;
  requiresHumanReview: boolean;
  sortOrder: number;
  /** `false` only for `premium`. */
  purchasable: boolean;
}

/** GET /v1/properties/:id/reports/pricing — authenticated, per-investor preview. Deliberately has no `alreadyOwned` field — `fe` derives ownership from `ReportOrder[]` (see `deriveTierOwnership` below). */
export interface ReportPricing {
  tierCode: string;
  displayName: string;
  purchasable: boolean;
  priceCents: number;
  priceBasis: "subscriber" | "non_subscriber";
  upgradeCreditAppliedCents: number;
  netPriceCents: number;
}

export type ReportOrderStatus =
  | "pending_payment"
  | "queued"
  | "generating"
  | "delivered"
  | "failed"
  | "awaiting_review"
  | "approved"
  | "refunded";

/** GET /v1/properties/:id/reports and GET /v1/report-orders/:id. */
export interface ReportOrder {
  id: string;
  propertyId: string;
  reportTierCode: string;
  pricePaidCents: number;
  priceBasis: string;
  upgradeCreditAppliedCents: number;
  /** Real status values are the `ReportOrderStatus` union above, but typed as `string` here defensively — FR10 requires the UI to never crash on an unexpected value, so callers must not assume exhaustiveness. */
  status: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
}

export class ReportCheckoutConflictError extends Error {}

/** GET /v1/report-orders/:id 404s for both "doesn't exist" and "exists but isn't yours" — intentionally indistinguishable (see `ReportOrdersService.getById`'s doc comment). */
export class ReportOrderNotFoundError extends Error {}

/** Reads Nest's default `{ statusCode, message, error }` error body, falling back to a generic message if the body isn't JSON or has no `message`. Duplicated from `watchlist-api.ts` rather than shared, matching that file's own precedent. */
async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    return data.message ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_URL ?? "http://localhost:3001";
  }
  return "/api";
}

/** Public — no auth required, callable server- or client-side (unlike the rest of this file, which is client-only per the tier-selection screen's authenticated calls). */
export async function fetchReportTiers(): Promise<ReportTier[]> {
  const res = await fetch(`${resolveBaseUrl()}/v1/report-tiers`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load report tiers (HTTP ${res.status})`);
  return (await res.json()) as ReportTier[];
}

export const reportTiersQueryKey = ["report-tiers"] as const;

export async function fetchReportPricing(propertyId: string): Promise<ReportPricing[]> {
  const res = await authFetch(`/api/v1/properties/${encodeURIComponent(propertyId)}/reports/pricing`);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load report pricing (HTTP ${res.status})`);
  return (await res.json()) as ReportPricing[];
}

export function reportPricingQueryKey(propertyId: string): readonly [string, string] {
  return ["report-pricing", propertyId] as const;
}

export async function fetchPropertyReportOrders(propertyId: string): Promise<ReportOrder[]> {
  const res = await authFetch(`/api/v1/properties/${encodeURIComponent(propertyId)}/reports`);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load your reports for this property (HTTP ${res.status})`);
  return (await res.json()) as ReportOrder[];
}

export function propertyReportOrdersQueryKey(propertyId: string): readonly [string, string] {
  return ["property-report-orders", propertyId] as const;
}

export interface ReportCheckoutResponse {
  checkoutUrl: string;
  orderId: string;
  priceCents: number;
  upgradeCreditAppliedCents: number;
}

/**
 * POST /v1/properties/:id/reports/checkout. Distinguishes the 409
 * "already own this tier or higher" case (`ReportCheckoutConflictError`) from
 * every other failure, per the UX doc's "two realistic failure shapes"
 * (409 vs. generic) — callers show different copy for each.
 */
export async function createReportCheckout(
  propertyId: string,
  tier: ReportTierCode,
): Promise<ReportCheckoutResponse> {
  const res = await authFetch(`/api/v1/properties/${encodeURIComponent(propertyId)}/reports/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 409) {
    throw new ReportCheckoutConflictError(
      (await readErrorMessage(res)) ?? "You already have this report tier or higher for this property.",
    );
  }
  if (!res.ok) {
    throw new Error((await readErrorMessage(res)) ?? `Couldn't start checkout (HTTP ${res.status}).`);
  }
  return (await res.json()) as ReportCheckoutResponse;
}

export async function fetchReportOrderById(id: string): Promise<ReportOrder> {
  const res = await authFetch(`/api/v1/report-orders/${encodeURIComponent(id)}`);
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 404) throw new ReportOrderNotFoundError("Report order not found.");
  if (!res.ok) throw new Error(`Failed to load this report (HTTP ${res.status})`);
  return (await res.json()) as ReportOrder;
}

export function reportOrderQueryKey(id: string): readonly [string, string] {
  return ["report-order", id] as const;
}

/**
 * Client-side ownership derivation, per the UX doc's architecture note
 * (`fe` derives "already owned" from `GET /v1/properties/:id/reports` rather
 * than a server-side `alreadyOwned` field, to avoid a second independently-
 * computed source of the same fact) — used by both the Report Selection
 * screen (per-tier-card state) and the Property Intelligence Page's entry
 * CTA (which report to route "View Your Report" to).
 *
 * For a tier the investor owns a `delivered` order for *exactly*, routes to
 * that order (`exact: true`). For a tier the investor never purchased
 * directly but already holds a `delivered` order at a *higher* tier for
 * (legal under BR4 — tiers can be bought in any order), there is no order to
 * route to for the lower tier itself; this returns the investor's
 * lowest-sort-order-owned qualifying higher order instead (`exact: false`)
 * so "View Your Report" still lands somewhere real. This does not change
 * purchasability (BR4/EC3 already block buying that lower tier outright) —
 * it only decides what an inherently-unpurchasable card's "View" affordance
 * points at, which the UX doc doesn't literally spell out for this specific
 * combination.
 */
export interface TierOwnership {
  kind: "none" | "owned";
  exact: boolean;
  orderId: string | null;
}

export function deriveTierOwnership(
  tierCode: string,
  tiers: ReportTier[],
  orders: ReportOrder[],
): TierOwnership {
  const sortOrderByCode = new Map(tiers.map((t) => [t.code, t.sortOrder]));
  const targetSortOrder = sortOrderByCode.get(tierCode);
  if (targetSortOrder === undefined) return { kind: "none", exact: false, orderId: null };

  const delivered = orders.filter((o) => o.status === "delivered");

  const exactOrder = delivered.find((o) => o.reportTierCode === tierCode);
  if (exactOrder) return { kind: "owned", exact: true, orderId: exactOrder.id };

  const higherOwned = delivered
    .filter((o) => (sortOrderByCode.get(o.reportTierCode) ?? -1) >= targetSortOrder)
    .sort((a, b) => (sortOrderByCode.get(a.reportTierCode) ?? -1) - (sortOrderByCode.get(b.reportTierCode) ?? -1));

  if (higherOwned.length > 0) {
    return { kind: "owned", exact: false, orderId: higherOwned[0]!.id };
  }

  return { kind: "none", exact: false, orderId: null };
}

/** The investor's highest-sortOrder `delivered` order for a property, if any — used by the Property Intelligence Page's entry CTA (per the UX doc's "View Your Report" -> highest owned order). */
export function highestDeliveredOrder(tiers: ReportTier[], orders: ReportOrder[]): ReportOrder | null {
  const sortOrderByCode = new Map(tiers.map((t) => [t.code, t.sortOrder]));
  const delivered = orders.filter((o) => o.status === "delivered");
  if (delivered.length === 0) return null;
  return delivered.reduce((best, cur) => {
    const bestSort = sortOrderByCode.get(best.reportTierCode) ?? -1;
    const curSort = sortOrderByCode.get(cur.reportTierCode) ?? -1;
    return curSort > bestSort ? cur : best;
  });
}
