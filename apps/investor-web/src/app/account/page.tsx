import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AccountWorkspace } from "@/components/account/AccountWorkspace";

/**
 * `/account` — protected route (see `RequireAuth`), and the Stripe
 * Checkout success/cancel redirect destination (`FRONTEND_URL` on the API
 * — see `apps/api/src/monetization/checkout-urls.ts`). `Suspense` wraps
 * `AccountWorkspace` because it reads `useSearchParams()` for the
 * `?checkout=` result, which Next.js requires a Suspense boundary for
 * during static generation.
 */
export default function AccountPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <AccountWorkspace />
      </Suspense>
    </RequireAuth>
  );
}
