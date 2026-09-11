import { RequireAuth } from "@/components/auth/RequireAuth";
import { SupportWorkspace } from "@/components/support/SupportWorkspace";

/**
 * `/support` — protected route (see `RequireAuth`). Thin server wrapper
 * only, no server-side prefetch — same rationale as `/watchlist` and
 * `/saved-searches` (per-user data behind a client-only bearer token).
 */
export default function SupportPage() {
  return (
    <RequireAuth>
      <SupportWorkspace />
    </RequireAuth>
  );
}
