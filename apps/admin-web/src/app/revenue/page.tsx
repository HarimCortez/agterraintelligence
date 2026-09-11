import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { RevenueWorkspace } from "@/components/revenue/RevenueWorkspace";

/** `/revenue` — protected (see `RequireAdminAuth`); also gated server-side by `revenue.read`. */
export default function RevenuePage() {
  return (
    <RequireAdminAuth>
      <RevenueWorkspace />
    </RequireAdminAuth>
  );
}
