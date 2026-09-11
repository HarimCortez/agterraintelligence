/** Mirrors investor-web's `formatCurrencyFromCents` — see that file's comment. Small enough that duplicating rather than sharing via packages/ui matches this codebase's existing pattern for per-app lib utilities. */
export function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatEnumLabel(value: string): string {
  return value.replace(/_/g, " ");
}
