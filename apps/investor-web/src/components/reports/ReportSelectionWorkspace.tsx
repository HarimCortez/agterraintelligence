"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ReportTierCard, type ReportTierCardOwnership } from "@agterra/ui";
import { fetchPropertyById, propertyQueryKey } from "@/lib/properties-api";
import { useAuthStore } from "@/lib/auth-store";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";
import {
  fetchReportTiers,
  fetchReportPricing,
  fetchPropertyReportOrders,
  createReportCheckout,
  deriveTierOwnership,
  reportTiersQueryKey,
  reportPricingQueryKey,
  propertyReportOrdersQueryKey,
  ReportCheckoutConflictError,
  type ReportTier,
  type ReportPricing,
  type ReportOrder,
  type ReportTierCode,
} from "@/lib/report-orders-api";

/** Suggested depth-only copy per the UX doc's Tier card anatomy section — content nits aside, this is a hard constraint on *accuracy* (depth, not fabricated content categories), not final wording. */
const TIER_DESCRIPTIONS: Record<string, string> = {
  essential: "Thesis-depth AI read — conclusion, key evidence, top risks.",
  investor: "Deeper evidence and scenario framing beyond the thesis.",
  professional: "Most thorough AI-generated analysis available — expanded evidence, risk, and scenario detail.",
  premium: "Analyst-reviewed intelligence (not yet available).",
};

const PREMIUM_LOCKED_REASON = "Requires analyst review — not yet available for purchase.";

interface ReportSelectionWorkspaceProps {
  propertyId: string;
}

export function ReportSelectionWorkspace({ propertyId }: ReportSelectionWorkspaceProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const handleUnauthorized = useHandleUnauthorized();

  // Finding 3 fix: the `?tier=` resume mechanic — `handleSelect` below sends
  // an unauthenticated investor through `/login?returnTo=...` with the
  // selected tier round-tripped in the destination URL's `tier` query param.
  // On return, highlight/scroll to that same tier card so the "one more
  // click" the UX doc describes is real, rather than a plain unhighlighted
  // grid. Deliberately does not auto-trigger a purchase — just identifies
  // the card.
  const searchParams = useSearchParams();
  const resumeTierCode = searchParams.get("tier");
  const highlightedCardRef = useRef<HTMLDivElement>(null);
  const hasScrolledToResumeTier = useRef(false);

  const propertyQuery = useQuery({
    queryKey: propertyQueryKey(propertyId),
    queryFn: () => fetchPropertyById(propertyId),
  });

  const tiersQuery = useQuery({ queryKey: reportTiersQueryKey, queryFn: fetchReportTiers });

  useEffect(() => {
    if (!resumeTierCode || hasScrolledToResumeTier.current) return;
    if (!highlightedCardRef.current) return;
    highlightedCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    hasScrolledToResumeTier.current = true;
  }, [resumeTierCode, tiersQuery.isSuccess]);

  // Authenticated-only queries — only fire once auth has rehydrated and a
  // user is present, matching `WatchToggle`'s `enabled: !!user` pattern.
  // While pending (or for a logged-out visitor), tier cards fall back to
  // public non-subscriber pricing with no ownership/credit applied — the
  // same "statistically correct first paint, swap in place once resolved"
  // approach the UX doc specifies for the Property Intelligence Page's CTA.
  const pricingQuery = useQuery({
    queryKey: reportPricingQueryKey(propertyId),
    queryFn: () => fetchReportPricing(propertyId),
    enabled: hasHydrated && !!user,
  });

  const ordersQuery = useQuery({
    queryKey: propertyReportOrdersQueryKey(propertyId),
    queryFn: () => fetchPropertyReportOrders(propertyId),
    enabled: hasHydrated && !!user,
  });

  const [activeTier, setActiveTier] = useState<ReportTierCode | null>(null);
  const [cardError, setCardError] = useState<{ tier: ReportTierCode; message: string } | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: (tier: ReportTierCode) => createReportCheckout(propertyId, tier),
    onMutate: (tier) => {
      setActiveTier(tier);
      setCardError(null);
    },
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (error, tier) => {
      if (handleUnauthorized(error)) return;
      setActiveTier(null);
      if (error instanceof ReportCheckoutConflictError) {
        setCardError({ tier, message: error.message });
        // A race (e.g. two tabs) — refresh ownership so the card flips to
        // "View Your Report" instead of staying stuck as purchasable.
        void queryClient.invalidateQueries({ queryKey: propertyReportOrdersQueryKey(propertyId) });
        return;
      }
      setCardError({
        tier,
        message: error instanceof Error ? error.message : "Couldn't start checkout.",
      });
    },
  });

  const handleSelect = (tierCode: ReportTierCode) => {
    if (!user) {
      const destination = `/properties/${propertyId}/reports?tier=${tierCode}`;
      router.push(`/login?returnTo=${encodeURIComponent(destination)}`);
      return;
    }
    checkoutMutation.mutate(tierCode);
  };

  const handleViewReport = (orderId: string) => {
    router.push(`/report-orders/${orderId}`);
  };

  return (
    <div className="p-xl">
      {propertyQuery.isSuccess ? (
        <Link
          href={`/properties/${propertyId}`}
          className="mb-lg inline-flex w-fit items-center gap-xs text-sm font-semibold text-action-primary hover:underline"
        >
          ← Back to {propertyQuery.data.address}
        </Link>
      ) : (
        <Link
          href={`/properties/${propertyId}`}
          className="mb-lg inline-flex w-fit items-center gap-xs text-sm font-semibold text-action-primary hover:underline"
        >
          ← Back to property
        </Link>
      )}

      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">
          {propertyQuery.isSuccess ? propertyQuery.data.address : "Choose a report"}
        </h1>
        <p className="mt-xs text-sm text-text-secondary">
          Choose the depth of AI-generated investment analysis for this property.
        </p>
      </header>

      <PricingBanner user={!!user} hasHydrated={hasHydrated} pricingQuery={pricingQuery} />

      {tiersQuery.isPending && <TierCardsSkeleton />}

      {tiersQuery.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
        >
          <p className="font-semibold">Couldn&apos;t load report options</p>
          <p className="text-text-secondary">
            {tiersQuery.error instanceof Error ? tiersQuery.error.message : "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={() => tiersQuery.refetch()}
            className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}

      {tiersQuery.isSuccess && (
        <>
          <div className="grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-4">
            {tiersQuery.data.map((tier) => (
              <TierCardSlot
                key={tier.code}
                tier={tier}
                allTiers={tiersQuery.data}
                user={!!user}
                pricing={pricingQuery.data}
                orders={ordersQuery.data}
                isSubmitting={checkoutMutation.isPending && activeTier === tier.code}
                isOtherSubmitting={checkoutMutation.isPending && activeTier !== tier.code}
                errorMessage={cardError?.tier === tier.code ? cardError.message : null}
                onSelect={() => handleSelect(tier.code as ReportTierCode)}
                onViewReport={handleViewReport}
                onRetry={() => checkoutMutation.mutate(tier.code as ReportTierCode)}
                highlighted={resumeTierCode === tier.code}
                scrollRef={resumeTierCode === tier.code ? highlightedCardRef : undefined}
              />
            ))}
          </div>

          <p className="mt-lg text-xs text-text-secondary">
            Payment is processed securely by Stripe. You&apos;ll be redirected to complete your purchase.
          </p>
        </>
      )}

      <footer className="mt-2xl border-t border-border-subtle pt-lg text-sm text-text-secondary">
        Questions about report purchases?{" "}
        <Link href="/support" className="font-semibold text-action-primary hover:underline">
          Visit the Support Center
        </Link>
        .
      </footer>
    </div>
  );
}

function PricingBanner({
  user,
  hasHydrated,
  pricingQuery,
}: {
  user: boolean;
  hasHydrated: boolean;
  pricingQuery: UseQueryResult<ReportPricing[], Error>;
}) {
  if (!hasHydrated) return null;

  if (!user) {
    return (
      <div className="mb-lg rounded border border-border-subtle bg-workspace-bg p-md text-sm text-text-secondary">
        <Link href="/login" className="font-semibold text-action-primary hover:underline">
          Log in
        </Link>{" "}
        to see your subscriber pricing, or continue below — pricing shown is non-subscriber.
      </div>
    );
  }

  // Independent, non-blocking section — a pricing-fetch failure/pending
  // state here just means the banner is momentarily absent, matching the
  // resilience principle used elsewhere (e.g. `AiAnalystPanel`'s per-section
  // error boundaries) — it never blocks the rest of the page.
  if (!pricingQuery.isSuccess || pricingQuery.data.length === 0) return null;

  const isSubscriber = pricingQuery.data[0]!.priceBasis === "subscriber";

  if (isSubscriber) {
    return (
      <div className="mb-lg rounded border border-border-subtle bg-workspace-bg p-md text-sm text-text-secondary">
        Subscriber pricing applied.
      </div>
    );
  }

  return (
    <div className="mb-lg rounded border border-border-subtle bg-workspace-bg p-md text-sm text-text-secondary">
      You&apos;re seeing non-subscriber pricing.{" "}
      <Link href="/account" className="font-semibold text-action-primary hover:underline">
        Upgrade to a paid plan →
      </Link>{" "}
      to lower this and every future report price by 33%.
    </div>
  );
}

function TierCardSlot({
  tier,
  allTiers,
  user,
  pricing,
  orders,
  isSubmitting,
  isOtherSubmitting,
  errorMessage,
  onSelect,
  onViewReport,
  onRetry,
  highlighted,
  scrollRef,
}: {
  tier: ReportTier;
  allTiers: ReportTier[];
  user: boolean;
  pricing: ReportPricing[] | undefined;
  orders: ReportOrder[] | undefined;
  isSubmitting: boolean;
  isOtherSubmitting: boolean;
  errorMessage: string | null;
  onSelect: () => void;
  onViewReport: (orderId: string) => void;
  onRetry: () => void;
  highlighted?: boolean;
  scrollRef?: RefObject<HTMLDivElement>;
}) {
  const pricingEntry = pricing?.find((p) => p.tierCode === tier.code);

  const priceCents = pricingEntry?.priceCents ?? tier.nonSubscriberPriceCents;
  const priceBasis = pricingEntry?.priceBasis ?? "non_subscriber";
  const upgradeCreditAppliedCents = pricingEntry?.upgradeCreditAppliedCents ?? 0;
  const netPriceCents = pricingEntry?.netPriceCents ?? priceCents;

  let ownership: ReportTierCardOwnership;
  if (!tier.purchasable) {
    ownership = { kind: "locked", reason: PREMIUM_LOCKED_REASON };
  } else if (user && orders) {
    const derived = deriveTierOwnership(tier.code, allTiers, orders);
    ownership = derived.kind === "owned" ? { kind: "owned", exact: derived.exact } : { kind: "none" };
  } else {
    // Logged out, or orders not yet resolved — defaults to "no report
    // owned" per the UX doc's loading-default rationale.
    ownership = { kind: "none" };
  }

  const orderIdForView =
    user && orders ? deriveTierOwnership(tier.code, allTiers, orders).orderId : null;

  return (
    <div ref={scrollRef}>
      <ReportTierCard
        tierCode={tier.code}
        displayName={tier.displayName}
        description={TIER_DESCRIPTIONS[tier.code] ?? ""}
        pricing={{
          priceCents,
          priceBasis,
          subscriberPriceCents: tier.subscriberPriceCents,
          upgradeCreditAppliedCents,
          netPriceCents,
        }}
        ownership={ownership}
        onSelect={onSelect}
        onViewReport={orderIdForView ? () => onViewReport(orderIdForView) : undefined}
        isSubmitting={isSubmitting}
        disabled={isOtherSubmitting}
        errorMessage={errorMessage}
        onRetry={onRetry}
        highlighted={highlighted}
      />
    </div>
  );
}

function TierCardsSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-4"
    >
      <span className="sr-only">Loading report options…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[220px] animate-pulse rounded border border-border-subtle bg-surface"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
