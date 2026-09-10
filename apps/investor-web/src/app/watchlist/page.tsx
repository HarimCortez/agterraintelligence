import { RequireAuth } from "@/components/auth/RequireAuth";
import { WatchlistWorkspace } from "@/components/watchlist/WatchlistWorkspace";

/**
 * `/watchlist` — protected route (see `RequireAuth`). Thin server wrapper
 * only, matching the `page.tsx` / `*Workspace.tsx` split used elsewhere.
 * No server-side prefetch: the watchlist is per-user data behind a bearer
 * token that only lives in client-side `localStorage` (via `useAuthStore`),
 * so unlike Discover/Property Intelligence there is nothing real to fetch
 * server-side — same rationale as `/compare`.
 */
export default function WatchlistPage() {
  return (
    <RequireAuth>
      <WatchlistWorkspace />
    </RequireAuth>
  );
}
