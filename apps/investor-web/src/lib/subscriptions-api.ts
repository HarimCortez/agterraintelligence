/**
 * Subscription API client — `GET /v1/subscription-plans` (public),
 * `GET /v1/subscriptions/me` and `POST /v1/subscriptions/checkout`
 * (authenticated). Shapes verified against
 * `apps/api/src/monetization/dto/monetization-response.dto.ts`, not guessed
 * at. `/me` returns a real "free tier, no subscription" shape rather than a
 * 404 when the user has no `Subscription` row — callers should treat
 * `plan: "free"` as a normal, valid state, not an error.
 */
"use client";

import { authFetch } from "./auth-fetch";
import { UnauthorizedError } from "./api-errors";

export type SubscriptionPlanCode = "free" | "basic" | "investor" | "professional";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "unpaid" | null;

export interface SubscriptionPlan {
  plan: SubscriptionPlanCode;
  displayName: string;
  priceCentsPerMonth: number;
  purchasable: boolean;
}

export interface SubscriptionMe {
  plan: SubscriptionPlanCode;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch("/api/v1/subscription-plans");
  if (!res.ok) throw new Error(`Failed to load plans (HTTP ${res.status})`);
  return (await res.json()) as SubscriptionPlan[];
}

export const subscriptionMeQueryKey = ["subscription", "me"] as const;

export async function fetchSubscriptionMe(): Promise<SubscriptionMe> {
  const res = await authFetch("/api/v1/subscriptions/me");
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to load subscription (HTTP ${res.status})`);
  return (await res.json()) as SubscriptionMe;
}

export async function startSubscriptionCheckout(plan: SubscriptionPlanCode): Promise<string> {
  const res = await authFetch("/api/v1/subscriptions/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to start checkout (HTTP ${res.status})`);
  const body = (await res.json()) as { checkoutUrl: string };
  return body.checkoutUrl;
}

/**
 * Starts a session for Stripe's hosted Billing Portal — cancel/change plan
 * and invoice history all happen there, not in custom UI here (see
 * `subscriptions.service.ts`'s `createBillingPortalSession` doc comment).
 * 400s if the user has never subscribed (no Stripe customer to manage).
 */
export async function startBillingPortalSession(): Promise<string> {
  const res = await authFetch("/api/v1/subscriptions/billing-portal", { method: "POST" });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Failed to open billing portal (HTTP ${res.status})`);
  const body = (await res.json()) as { portalUrl: string };
  return body.portalUrl;
}
