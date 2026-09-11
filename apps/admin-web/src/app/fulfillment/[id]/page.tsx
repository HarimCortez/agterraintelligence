import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { FulfillmentOrderDetail } from "@/components/fulfillment/FulfillmentOrderDetail";

/** `/fulfillment/:id` — protected (see `RequireAdminAuth`); also gated server-side by `fulfillment.read`. */
export default function FulfillmentOrderPage({ params }: { params: { id: string } }) {
  return (
    <RequireAdminAuth>
      <FulfillmentOrderDetail orderId={params.id} />
    </RequireAdminAuth>
  );
}
