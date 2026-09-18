import { useEffect, useRef, type ReactNode } from "react";
import { CheckmarkIcon, StarFilledIcon } from "../icons";

/**
 * Report tier card — the shared component named in DESIGN-SYSTEM.md's
 * anticipated component list ("report tier card (pricing)") and specified in
 * full by `docs/requirements/report-selection-purchase-and-purchased-report-workspace-ux.md`'s
 * "Tier card CTA states" table. Covers all five CTA-state variants declared
 * there via one `ownership` prop (the caller derives ownership client-side
 * from `GET /v1/properties/:id/reports`, per that document's architecture
 * note — this component never talks to the network itself):
 *
 * - `{ kind: "purchasable" }` — normal buy card, with or without an upgrade
 *   credit line depending on `pricing.upgradeCreditAppliedCents`.
 * - `{ kind: "owned", exact: true }` — investor holds a `delivered` order at
 *   exactly this tier.
 * - `{ kind: "owned", exact: false }` — investor holds a `delivered` order at
 *   a *higher* tier only (this exact tier was never purchased) — same
 *   "already have deeper analysis" treatment, `onViewReport` should route to
 *   the higher tier's own order (the caller resolves which one).
 * - `{ kind: "locked", reason }` — Premium's not-yet-purchasable state
 *   (`BR5`), the "locked-intelligence" visual posture reused from
 *   `AiAnalystPanel`'s `UpgradeState`/`LoggedOutState` (visible, priced,
 *   described, CTA disabled with a clear reason — never hidden).
 *
 * `isSubmitting`/`disabled`/`errorMessage`/`onRetry` cover the "mid-purchase"
 * and "purchase-initiation error" states, which are per-card per the UX doc
 * (not page-level) — the parent screen owns the `useMutation` and passes its
 * state down here per card.
 */

export type ReportTierCardOwnership =
  | { kind: "none" }
  | { kind: "owned"; exact: boolean }
  | { kind: "locked"; reason: string };

export interface ReportTierCardPricing {
  /** This investor's applicable base price for this tier (subscriber or non-subscriber), or the public non-subscriber price for a logged-out/loading view. */
  priceCents: number;
  priceBasis: "subscriber" | "non_subscriber";
  /** Only shown (struck through) when `priceBasis` is `"non_subscriber"` and this differs from `priceCents` — the "upgrade to save" nudge (FR3). */
  subscriberPriceCents?: number;
  /** 0 if no upgrade credit applies. */
  upgradeCreditAppliedCents: number;
  /** `max(priceCents - upgradeCreditAppliedCents, 0)` — what checkout will actually charge, per FR4. Never independently recomputed here — always passed in from the backend's own `GET /v1/properties/:id/reports/pricing` response. */
  netPriceCents: number;
}

export interface ReportTierCardProps {
  tierCode: string;
  displayName: string;
  /** One short "depth" description line, per FR6's depth-not-content-category constraint. */
  description: string;
  pricing: ReportTierCardPricing;
  ownership: ReportTierCardOwnership;
  /** Optional short parenthetical naming which prior report the credit came from, e.g. "from your Essential report" — content-level nicety, omit if not derivable. */
  creditSourceNote?: string;
  /** Called when the primary "Select [Tier]" CTA is clicked. Not called for `locked`/`owned` cards (no button wired). */
  onSelect?: () => void;
  /** Called when the "View Your Report" CTA is clicked (`owned` cards only). */
  onViewReport?: () => void;
  /** This card's own checkout-session-creation mutation is in flight. */
  isSubmitting?: boolean;
  /** True while a *different* card's checkout mutation is in flight — this card's own CTA becomes non-interactive (but stays visible) to prevent a second concurrent attempt. */
  disabled?: boolean;
  /** Inline purchase-initiation error for this specific card (409 vs. generic — caller decides the message). */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Visually distinguishes this as the tier the investor previously selected before an interruption (e.g. the `?tier=` login round-trip) — a ring/emphasis treatment only, never auto-triggers a purchase. */
  highlighted?: boolean;
  className?: string;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function CardShell({
  children,
  emphasis,
  highlighted = false,
}: {
  children: ReactNode;
  emphasis: "normal" | "muted" | "gold";
  highlighted?: boolean;
}) {
  const borderClass =
    emphasis === "gold"
      ? "border-l-[3px] border-l-gold-accent border-border-subtle"
      : emphasis === "muted"
        ? "border-border-subtle bg-workspace-bg"
        : "border-border-subtle";
  // Finding 3 fix: reuses the design system's existing ring-emphasis
  // treatment (no new component variant) to identify the tier the investor
  // previously selected before the login round-trip (`?tier=` resume).
  const highlightClass = highlighted ? "ring-2 ring-action-primary ring-offset-2" : "";
  return (
    <div
      className={`flex h-full flex-col gap-md rounded border bg-surface p-lg ${borderClass} ${highlightClass}`}
    >
      {children}
    </div>
  );
}

export function ReportTierCard({
  tierCode,
  displayName,
  description,
  pricing,
  ownership,
  creditSourceNote,
  onSelect,
  onViewReport,
  isSubmitting = false,
  disabled = false,
  errorMessage,
  onRetry,
  highlighted = false,
  className = "",
}: ReportTierCardProps) {
  const reasonId = `report-tier-${tierCode}-locked-reason`;
  const hasCredit = pricing.upgradeCreditAppliedCents > 0;
  const showStrikethrough =
    pricing.priceBasis === "non_subscriber" &&
    typeof pricing.subscriberPriceCents === "number" &&
    pricing.subscriberPriceCents < pricing.priceCents;

  if (ownership.kind === "locked") {
    return (
      <div className={className}>
        <CardShell emphasis="gold" highlighted={highlighted}>
          <div className="flex items-center gap-xs">
            <StarFilledIcon className="h-4 w-4 shrink-0 text-gold-accent" />
            <h3 className="text-base font-semibold text-text-primary">{displayName}</h3>
          </div>
          <p className="font-serif text-2xl tabular-nums text-text-primary">
            {formatUsd(pricing.priceCents)}
          </p>
          <p className="text-sm text-text-secondary">{description}</p>
          <div className="mt-auto flex flex-col gap-xs">
            <button
              type="button"
              disabled
              aria-describedby={reasonId}
              className="cursor-not-allowed rounded border border-border-default bg-workspace-bg px-md py-sm text-sm font-semibold text-text-secondary"
            >
              Not yet available
            </button>
            <p id={reasonId} className="text-xs text-text-secondary">
              {ownership.reason}
            </p>
          </div>
        </CardShell>
      </div>
    );
  }

  if (ownership.kind === "owned") {
    return (
      <div className={className}>
        <CardShell emphasis="muted" highlighted={highlighted}>
          <div className="flex items-center justify-between gap-sm">
            <h3 className="text-base font-semibold text-text-primary">{displayName}</h3>
            <span className="inline-flex items-center gap-xs rounded bg-confidence-verified-bg px-sm py-xs text-xs font-semibold text-confidence-verified-text">
              <CheckmarkIcon className="h-3 w-3 shrink-0" />
              <span>{ownership.exact ? "You own this" : "You own a higher tier"}</span>
            </span>
          </div>
          <p className="font-serif text-2xl tabular-nums text-text-secondary">
            {formatUsd(pricing.priceCents)}
          </p>
          <p className="text-sm text-text-secondary">{description}</p>
          <div className="mt-auto">
            <button
              type="button"
              onClick={onViewReport}
              aria-label={`View your ${displayName} report`}
              className="w-full rounded border border-action-primary px-md py-sm text-sm font-semibold text-action-primary hover:bg-workspace-bg"
            >
              View Your Report
            </button>
          </div>
        </CardShell>
      </div>
    );
  }

  // ownership.kind === "none" — purchasable.
  const netLabel = formatUsd(pricing.netPriceCents);
  const visibleLabel = hasCredit ? `Select ${displayName} — ${netLabel}` : `Select ${displayName}`;
  const ariaLabel = `Select ${displayName} tier — ${netLabel}`;
  const isBusy = isSubmitting;

  // `isBusy` (derived from the parent's `useMutation().isPending`) doesn't
  // become true synchronously on click — TanStack Query's own internal
  // notification path defers the re-render through a macrotask, so two
  // click/Enter events arriving before that re-render lands could both pass
  // an `if (isBusy) return` guard and double-fire `onSelect`. This ref is
  // set synchronously in the click handler itself, closing that gap
  // regardless of how the query library schedules its state update, and is
  // released once `isSubmitting` actually flips back to false (mutation
  // settled) so a later, legitimate click isn't permanently locked out.
  const clickLockRef = useRef(false);
  useEffect(() => {
    if (!isSubmitting) clickLockRef.current = false;
  }, [isSubmitting]);

  return (
    <div className={className}>
      <CardShell emphasis="normal" highlighted={highlighted}>
        <h3 className="text-base font-semibold text-text-primary">{displayName}</h3>
        <div className="flex flex-wrap items-baseline gap-xs">
          <p className="font-serif text-2xl tabular-nums text-text-primary">
            {formatUsd(pricing.priceCents)}
          </p>
          {showStrikethrough && (
            <p className="text-xs tabular-nums text-text-secondary line-through">
              {formatUsd(pricing.subscriberPriceCents!)}
            </p>
          )}
        </div>
        <p className="text-sm text-text-secondary">{description}</p>

        {hasCredit && (
          <div className="rounded bg-confidence-verified-bg px-sm py-sm text-xs tabular-nums text-confidence-verified-text">
            <p>
              Your credit: −{formatUsd(pricing.upgradeCreditAppliedCents)}
              {creditSourceNote ? ` (${creditSourceNote})` : ""}
            </p>
            <p>Net price: {netLabel}</p>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-sm">
          <span aria-live="polite" className="sr-only">
            {isBusy ? "Creating checkout…" : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              // Guards re-entry (a second click on this same card while its
              // own mutation is in flight) without the native `disabled`
              // attribute — see the `aria-disabled` note below. The ref
              // check is the actual synchronous guard (see its own comment
              // above); `isBusy` alone isn't reliably synchronous enough.
              if (isBusy || clickLockRef.current) return;
              clickLockRef.current = true;
              onSelect?.();
            }}
            disabled={disabled}
            aria-disabled={isBusy || disabled}
            aria-label={ariaLabel}
            aria-busy={isBusy}
            className={`inline-flex items-center justify-center gap-xs rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
              isBusy ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            {isBusy && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white"
              />
            )}
            <span>{isBusy ? "Creating checkout…" : visibleLabel}</span>
          </button>

          {errorMessage && (
            <div
              role="alert"
              className="flex flex-col items-start gap-xs rounded border border-risk-medium-bg bg-surface p-sm text-xs text-text-primary"
            >
              <p>{errorMessage}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded bg-action-primary px-sm py-xs text-xs font-semibold text-white hover:opacity-90"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </CardShell>
    </div>
  );
}
