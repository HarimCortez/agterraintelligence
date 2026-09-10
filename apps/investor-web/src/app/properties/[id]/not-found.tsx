import Link from "next/link";

/**
 * Rendered when `PropertyDetailPage` calls Next's `notFound()` — covers both
 * the API's 404 (valid UUID, no such property) and 400 (`:id` not a valid
 * UUID) cases, which `fetchPropertyById` collapses into one
 * `PropertyNotFoundError`. A real styled state, not a crash or blank page.
 *
 * No nav rail here — `AppShell` (root layout) supplies it for every route,
 * including this segment-level `not-found.tsx`.
 */
export default function PropertyNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-md p-xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
        404
      </p>
      <h1 className="text-2xl font-semibold text-text-primary">Property not found</h1>
      <p className="max-w-prose text-sm text-text-secondary">
        We couldn&apos;t find a property at this address. It may have been removed, or the link may be
        incorrect.
      </p>
      <Link
        href="/"
        className="mt-sm rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90"
      >
        Back to Discover
      </Link>
    </div>
  );
}
