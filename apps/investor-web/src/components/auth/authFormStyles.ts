/**
 * Shared field/button classnames for the login and register forms — same
 * Tailwind tokens `FilterPanel.tsx` already established (`labelClass`,
 * `inputClass`, primary-button treatment), factored out here instead of
 * duplicated in both pages since both forms need identical field styling.
 * `packages/ui` has no form-input/button components to reuse (only
 * badge-style presentational components exist there today), so these are
 * plain Tailwind strings, not a new design-system component being invented.
 */

export const labelClass = "text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary";

export const inputClass =
  "w-full rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary";

export const primaryButtonClass =
  "w-full rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-action-primary disabled:cursor-not-allowed disabled:opacity-60";

/** Reuses the risk-flag "high" red as form-level error text — no dedicated error-text token exists in colors.css, and red is already the system-wide negative/risk color per DESIGN-SYSTEM.md. */
export const errorTextClass = "text-sm text-risk-high-bg";
