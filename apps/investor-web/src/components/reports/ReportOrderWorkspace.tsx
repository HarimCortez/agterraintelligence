"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AiAnalysisResult, type AiAnalysisResultData } from "@agterra/ui";
import { WatchToggle } from "@/components/WatchToggle";
import { CompareToggle } from "@/components/CompareToggle";
import { fetchPropertyById, propertyQueryKey, type PropertyDetail } from "@/lib/properties-api";
import { formatCurrencyFromCents } from "@/lib/formatters";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";
import {
  fetchReportOrderById,
  fetchReportTiers,
  reportOrderQueryKey,
  reportTiersQueryKey,
  ReportOrderNotFoundError,
  type ReportOrder,
  type ReportTier,
} from "@/lib/report-orders-api";

const IN_PROGRESS_STATUSES = new Set(["queued", "generating"]);

/**
 * Text for the always-mounted status live region (Finding 1 fix) — one
 * persistent `aria-live="polite"` node whose *text content* changes on every
 * `order.status` transition, independent of the per-state visual component
 * tree in `OrderBody` unmounting/remounting entirely on each switch branch.
 * Screen readers announce content changes to an already-mounted live region;
 * they do NOT reliably announce a brand-new live region node appearing after
 * an old one is removed, which is what happens across `OrderBody`'s
 * `queued`/`generating` -> `delivered` transition.
 */
function orderStatusAnnouncement(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Report status: not yet purchased.";
    case "queued":
      return "Report status: queued for generation.";
    case "generating":
      return "Report status: generating.";
    case "delivered":
      return "Report status: ready. Your report is now available.";
    case "failed":
      return "Report status: generation failed.";
    default:
      return `Report status: ${status}.`;
  }
}

interface ReportOrderWorkspaceProps {
  orderId: string;
}

export function ReportOrderWorkspace({ orderId }: ReportOrderWorkspaceProps) {
  const handleUnauthorized = useHandleUnauthorized();

  const orderQuery = useQuery({
    queryKey: reportOrderQueryKey(orderId),
    queryFn: () => fetchReportOrderById(orderId),
    // Auto-poll while the order is still in flight (FR/UX Screen 2's
    // `queued`/`generating` states) so `delivered` is picked up without a
    // manual refresh. 7s split of the UX doc's suggested 5-10s window.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && IN_PROGRESS_STATUSES.has(status) ? 7000 : false;
    },
  });

  const tiersQuery = useQuery({ queryKey: reportTiersQueryKey, queryFn: fetchReportTiers });

  const propertyId = orderQuery.data?.propertyId;
  const propertyQuery = useQuery({
    queryKey: propertyQueryKey(propertyId ?? ""),
    queryFn: () => fetchPropertyById(propertyId!),
    enabled: !!propertyId,
  });

  // Session-expiry redirect must happen as an effect, not inline during
  // render (matches `AccountWorkspace`/`SupportWorkspace`'s pattern) —
  // 401-specific only; a plain 404 (handled separately below) is never
  // routed through here.
  useEffect(() => {
    if (orderQuery.error && !(orderQuery.error instanceof ReportOrderNotFoundError)) {
      handleUnauthorized(orderQuery.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderQuery.error]);

  if (orderQuery.isPending) {
    return (
      <div className="p-xl">
        <LoadingState />
      </div>
    );
  }

  if (orderQuery.isError) {
    if (orderQuery.error instanceof ReportOrderNotFoundError) {
      return (
        <div className="p-xl">
          <div
            role="alert"
            className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
          >
            <p className="font-semibold">Report not found</p>
            <p className="text-text-secondary">
              We couldn&apos;t find this report, or it isn&apos;t associated with your account.
            </p>
            <Link
              href="/"
              className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
            >
              Back to Discover
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="p-xl">
        <div
          role="alert"
          className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
        >
          <p className="font-semibold">Couldn&apos;t load this report</p>
          <p className="text-text-secondary">
            {orderQuery.error instanceof Error ? orderQuery.error.message : "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={() => orderQuery.refetch()}
            className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const order = orderQuery.data;
  const tier = tiersQuery.data?.find((t) => t.code === order.reportTierCode);

  return (
    <div className="p-xl">
      {/*
        Finding 1 fix: one stable, always-mounted live region for the whole
        workspace, separate from `OrderBody`'s per-state visual `role="status"`
        blocks (kept as-is for sighted users). This node's text content
        changes on every `order.status` change — including the
        `queued`/`generating` -> `delivered` transition driven by the
        `refetchInterval` poll above — which is what assistive tech actually
        needs to pick up, regardless of what `OrderBody`'s switch statement
        mounts/unmounts underneath it.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {orderStatusAnnouncement(order.status)}
      </span>

      <OrderHeader order={order} tierDisplayName={tier?.displayName ?? order.reportTierCode} property={propertyQuery.data} propertyId={order.propertyId} />

      <div className="mt-xl">
        <OrderBody order={order} tiers={tiersQuery.data} />
      </div>
    </div>
  );
}

function OrderHeader({
  order,
  tierDisplayName,
  property,
  propertyId,
}: {
  order: ReportOrder;
  tierDisplayName: string;
  property: PropertyDetail | undefined;
  propertyId: string;
}) {
  const purchaseDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="rounded border border-border-subtle bg-surface p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <Link
            href={`/properties/${propertyId}`}
            className="text-lg font-semibold text-action-primary hover:underline"
          >
            {property?.address ?? "View property"}
          </Link>
          {property && (
            <p className="mt-xs text-sm text-text-secondary">
              {property.county} County, {property.state}
            </p>
          )}
        </div>
        <span className="inline-flex items-center rounded bg-workspace-bg px-sm py-xs text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-primary">
          {tierDisplayName}
        </span>
      </div>

      <dl className="mt-md grid grid-cols-2 gap-md sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
            Purchase date
          </dt>
          <dd className="text-sm text-text-primary">{purchaseDate}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
            Price paid
          </dt>
          <dd className="text-sm tabular-nums text-text-primary">
            {formatCurrencyFromCents(order.pricePaidCents)}
          </dd>
          {order.upgradeCreditAppliedCents > 0 && (
            <dd className="text-xs tabular-nums text-text-secondary">
              Includes {formatCurrencyFromCents(order.upgradeCreditAppliedCents)} upgrade credit
            </dd>
          )}
        </div>
      </dl>
    </header>
  );
}

function OrderBody({ order, tiers }: { order: ReportOrder; tiers: ReportTier[] | undefined }) {
  switch (order.status) {
    case "pending_payment":
      return <PendingPaymentState propertyId={order.propertyId} />;
    case "queued":
      return <QueuedState />;
    case "generating":
      return <GeneratingState />;
    case "delivered":
      return <DeliveredState order={order} tiers={tiers} />;
    case "failed":
      return <FailedState />;
    default:
      return <UnknownStatusState status={order.status} />;
  }
}

function PendingPaymentState({ propertyId }: { propertyId: string }) {
  return (
    <div role="status" className="rounded border border-border-subtle bg-workspace-bg p-lg text-sm text-text-secondary">
      <p className="font-semibold text-text-primary">This report hasn&apos;t been purchased yet</p>
      <p className="mt-xs">
        If you started checkout and it didn&apos;t complete, you can pick a tier and try again.
      </p>
      <Link
        href={`/properties/${propertyId}/reports`}
        className="mt-md inline-flex rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Choose a Report Tier
      </Link>
    </div>
  );
}

function QueuedState() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-sm rounded border border-border-subtle bg-workspace-bg p-lg text-sm text-text-secondary">
      <span
        aria-hidden="true"
        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border-default border-t-action-primary"
      />
      <span>Your report is queued for generation. This usually starts within a few minutes.</span>
    </div>
  );
}

function GeneratingState() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-sm rounded border border-border-subtle bg-workspace-bg p-lg text-sm text-text-secondary">
      <span
        aria-hidden="true"
        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border-default border-t-action-primary"
      />
      <span>Generating your report… this can take a minute.</span>
    </div>
  );
}

const VALID_CONFIDENCE_LEVELS = new Set(["high", "moderate", "limited", "unknown"]);

/**
 * Defensive validation for `order.content` (typed `unknown` at the DTO
 * layer, per FR11) before handing it to the shared `AiAnalysisResult`
 * renderer — checks every field the renderer actually reads, including that
 * `confidence` is one of the four allowed levels (not just any string),
 * since `AiAnalysisResult`'s confidence badge lookup would otherwise throw
 * on an unrecognized value.
 */
function isAiAnalysisResultData(value: unknown): value is AiAnalysisResultData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.conclusion === "string" &&
    Array.isArray(v.evidence) &&
    v.evidence.every((e) => typeof e === "string") &&
    Array.isArray(v.risks) &&
    v.risks.every((r) => typeof r === "string") &&
    typeof v.confidence === "string" &&
    VALID_CONFIDENCE_LEVELS.has(v.confidence) &&
    Array.isArray(v.sources) &&
    v.sources.every((s) => typeof s === "string") &&
    typeof v.nextAction === "string"
  );
}

function DeliveredState({ order, tiers }: { order: ReportOrder; tiers: ReportTier[] | undefined }) {
  if (!isAiAnalysisResultData(order.content)) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
      >
        <p className="font-semibold">Couldn&apos;t display this report</p>
        <p className="text-text-secondary">
          This report&apos;s content doesn&apos;t match the expected format. Contact Support if this persists.
        </p>
        <Link
          href="/support"
          className="rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
        >
          Contact Support
        </Link>
      </div>
    );
  }

  const currentTier = tiers?.find((t) => t.code === order.reportTierCode);
  const hasStrictlyHigherPurchasableTier =
    !!currentTier &&
    !!tiers?.some((t) => t.purchasable && t.sortOrder > currentTier.sortOrder);

  return (
    <div className="flex flex-col gap-xl">
      <div className="rounded border border-border-subtle bg-surface p-lg">
        <AiAnalysisResult result={order.content} />
      </div>

      <div className="flex flex-wrap items-center gap-lg border-t border-border-subtle pt-lg">
        <Link
          href={`/properties/${order.propertyId}#ai-analyst`}
          className="text-sm font-semibold text-action-primary hover:underline"
        >
          Ask AI about this property
        </Link>
        {hasStrictlyHigherPurchasableTier && (
          <Link
            href={`/properties/${order.propertyId}/reports`}
            className="text-sm font-semibold text-action-primary hover:underline"
          >
            Upgrade this report
          </Link>
        )}
        <WatchToggle propertyId={order.propertyId} />
        <CompareToggle propertyId={order.propertyId} />
      </div>
    </div>
  );
}

function FailedState() {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-sm rounded border border-risk-medium-bg bg-surface p-lg text-sm text-text-primary"
    >
      <p className="font-semibold">This report couldn&apos;t be generated</p>
      <p className="text-text-secondary">
        This has been flagged to our team for follow-up — no charge has been automatically refunded. If you
        have questions,{" "}
        <Link href="/support" className="font-semibold text-action-primary hover:underline">
          contact Support
        </Link>
        .
      </p>
    </div>
  );
}

function UnknownStatusState({ status }: { status: string }) {
  return (
    <div role="status" className="rounded border border-border-subtle bg-workspace-bg p-lg text-sm text-text-secondary">
      <p>
        This report&apos;s status is <span className="font-semibold text-text-primary">{status}</span> — a
        workspace view for this status isn&apos;t built yet.{" "}
        <Link href="/support" className="font-semibold text-action-primary hover:underline">
          Contact Support
        </Link>
        .
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-lg" role="status" aria-live="polite">
      <span className="sr-only">Loading your report…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[100px] animate-pulse rounded border border-border-subtle bg-surface"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
