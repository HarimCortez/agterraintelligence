import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { OverviewWorkspace } from "@/components/overview/OverviewWorkspace";

/**
 * `/` — protected (see `RequireAdminAuth`). First real admin screen: proves
 * the admin auth plane end-to-end (login, MFA prompt if enrolled, session
 * persistence, logout) and shows who's logged in. The other 9 admin
 * modules from REQUIREMENTS.md Section C (Billing/Entitlements, Report
 * Fulfillment, Data Sources, Support, Content/Data QA, AI Monitoring,
 * Revenue Analytics, Administration Settings, Audit Logs) are real,
 * separately-scoped follow-up work — multi-quarter scope per
 * REQUIREMENTS.md's own estimate, not something to build speculatively
 * here.
 */
export default function OverviewPage() {
  return (
    <RequireAdminAuth>
      <OverviewWorkspace />
    </RequireAdminAuth>
  );
}
