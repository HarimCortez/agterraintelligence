import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { BillingWorkspace } from "@/components/billing/BillingWorkspace";

/** `/billing` — protected (see `RequireAdminAuth`); also gated server-side by `billing.read` (see `BillingWorkspace`'s doc comment). */
export default function BillingPage() {
  return (
    <RequireAdminAuth>
      <BillingWorkspace />
    </RequireAdminAuth>
  );
}
