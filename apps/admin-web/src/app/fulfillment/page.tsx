import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { FulfillmentWorkspace } from "@/components/fulfillment/FulfillmentWorkspace";

/** `/fulfillment` — protected (see `RequireAdminAuth`); also gated server-side by `fulfillment.read`/`fulfillment.retry`. */
export default function FulfillmentPage() {
  return (
    <RequireAdminAuth>
      <FulfillmentWorkspace />
    </RequireAdminAuth>
  );
}
