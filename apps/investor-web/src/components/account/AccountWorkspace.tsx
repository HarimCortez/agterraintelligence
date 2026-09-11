"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSubscriptionMe,
  fetchSubscriptionPlans,
  startSubscriptionCheckout,
  subscriptionMeQueryKey,
  type SubscriptionPlanCode,
} from "@/lib/subscriptions-api";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";
import { formatCurrencyFromCents } from "@/lib/formatters";
import { useAuthStore } from "@/lib/auth-store";

/**
 * `/account` — the Stripe Checkout success/cancel redirect destination
 * (`FRONTEND_URL` on the API, see `checkout-urls.ts`) as well as the page
 * for starting a subscription. There's no billing-portal integration yet
 * (a later pass — see `stripe-client.service.ts`), so this only covers
 * viewing current plan status and starting a new subscription checkout,
 * not cancelling/changing an existing one.
 *
 * The `?checkout=success|cancelled` query param is set by the API's
 * redirect URLs, not chosen by this page — it's informational only
 * (Stripe's webhook, not this redirect, is what actually updates
 * subscription state, so a `success` banner here doesn't guarantee the
 * webhook has landed yet; the query below refetches on mount and will
 * reflect the real state once it has).
 */
export function AccountWorkspace() {
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");
  const queryClient = useQueryClient();
  const handleUnauthorized = useHandleUnauthorized();
  const user = useAuthStore((state) => state.user);

  const meQuery = useQuery({ queryKey: subscriptionMeQueryKey, queryFn: fetchSubscriptionMe });
  const plansQuery = useQuery({ queryKey: ["subscription-plans"], queryFn: fetchSubscriptionPlans });

  useEffect(() => {
    if (meQuery.error) handleUnauthorized(meQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meQuery.error]);

  // A successful checkout redirect lands here before the webhook has
  // necessarily landed — refetch once, shortly after mount, to give the
  // webhook a moment and then reflect the real state instead of the stale
  // pre-checkout one.
  useEffect(() => {
    if (checkoutResult !== "success") return;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: subscriptionMeQueryKey });
    }, 2000);
    return () => clearTimeout(timer);
  }, [checkoutResult, queryClient]);

  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanCode | null>(null);
  const checkoutMutation = useMutation({
    mutationFn: startSubscriptionCheckout,
    onMutate: (plan) => setCheckoutPlan(plan),
    onSuccess: (checkoutUrl) => {
      window.location.href = checkoutUrl;
    },
    onError: (error) => {
      setCheckoutPlan(null);
      handleUnauthorized(error);
    },
  });

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Account</h1>
        <p className="text-sm text-text-secondary">{user?.email}</p>
      </header>

      {checkoutResult === "success" && (
        <div
          role="status"
          className="mb-lg rounded bg-score-exceptional-bg p-md text-sm text-score-exceptional-text"
        >
          Payment successful. Your plan will update within a few seconds.
        </div>
      )}
      {checkoutResult === "cancelled" && (
        <div
          role="status"
          className="mb-lg rounded border border-border-subtle bg-surface p-md text-sm text-text-secondary"
        >
          Checkout was cancelled — no charge was made.
        </div>
      )}

      <section className="mb-xl rounded border border-border-subtle bg-surface p-lg">
        <h2 className="mb-md text-lg font-semibold text-text-primary">Current plan</h2>
        {meQuery.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
        {meQuery.isSuccess && <CurrentPlanSummary me={meQuery.data} />}
      </section>

      <section>
        <h2 className="mb-md text-lg font-semibold text-text-primary">Plans</h2>
        {plansQuery.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
        {plansQuery.isError && (
          <p className="text-sm text-text-secondary">Couldn&apos;t load plans. Refresh to try again.</p>
        )}
        {plansQuery.isSuccess && (
          <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
            {plansQuery.data
              .filter((plan) => plan.purchasable)
              .map((plan) => {
                const isCurrent = meQuery.data?.plan === plan.plan && meQuery.data?.status === "active";
                return (
                  <div
                    key={plan.plan}
                    className="flex flex-col gap-sm rounded border border-border-subtle bg-surface p-lg"
                  >
                    <h3 className="text-base font-semibold text-text-primary">{plan.displayName}</h3>
                    <p className="text-xl font-semibold text-text-primary">
                      {formatCurrencyFromCents(plan.priceCentsPerMonth)}
                      <span className="text-sm font-normal text-text-secondary"> / month</span>
                    </p>
                    <button
                      type="button"
                      disabled={isCurrent || checkoutMutation.isPending}
                      onClick={() => checkoutMutation.mutate(plan.plan as SubscriptionPlanCode)}
                      className="mt-sm rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCurrent
                        ? "Current plan"
                        : checkoutMutation.isPending && checkoutPlan === plan.plan
                          ? "Redirecting…"
                          : "Subscribe"}
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

function CurrentPlanSummary({ me }: { me: import("@/lib/subscriptions-api").SubscriptionMe }) {
  if (me.plan === "free" || me.status !== "active") {
    return <p className="text-sm text-text-secondary">You&apos;re on the Free plan.</p>;
  }
  return (
    <div className="text-sm text-text-primary">
      <p className="font-semibold capitalize">{me.plan} — {me.status}</p>
      {me.currentPeriodEnd && (
        <p className="text-text-secondary">
          Renews {new Date(me.currentPeriodEnd).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}
    </div>
  );
}
