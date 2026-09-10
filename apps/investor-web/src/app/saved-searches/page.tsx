import { RequireAuth } from "@/components/auth/RequireAuth";
import { SavedSearchesWorkspace } from "@/components/saved-searches/SavedSearchesWorkspace";

/**
 * `/saved-searches` — protected route (see `RequireAuth`). Thin server
 * wrapper only, no server-side prefetch — same rationale as `/watchlist`
 * and `/compare` (per-user data behind a client-only bearer token).
 */
export default function SavedSearchesPage() {
  return (
    <RequireAuth>
      <SavedSearchesWorkspace />
    </RequireAuth>
  );
}
