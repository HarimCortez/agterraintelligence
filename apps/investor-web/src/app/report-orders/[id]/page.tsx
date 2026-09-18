import { RequireAuth } from "@/components/auth/RequireAuth";
import { ReportOrderWorkspace } from "@/components/reports/ReportOrderWorkspace";

interface ReportOrderPageProps {
  params: { id: string };
}

/**
 * `/report-orders/[id]` — Purchased Report Workspace (Screen 2). Protected
 * route (`RequireAuth`, same convention as `/watchlist`/`/support`) — order
 * ownership is per-account and `GET /v1/report-orders/:id` already requires
 * a bearer token, so there is nothing meaningful to prefetch server-side for
 * a logged-out visitor. This is also the real Stripe success-redirect
 * target (`buildReportCheckoutSuccessUrl` in
 * `apps/api/src/monetization/checkout-urls.ts` already points here with
 * `?checkout=success` — the redirect-target gap flagged in the requirements
 * doc's Dependencies #2 is already resolved server-side, no interim
 * `/account` fallback needed).
 */
export default function ReportOrderPage({ params }: ReportOrderPageProps) {
  return (
    <RequireAuth>
      <ReportOrderWorkspace orderId={params.id} />
    </RequireAuth>
  );
}
