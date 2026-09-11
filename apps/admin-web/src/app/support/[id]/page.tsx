import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { SupportTicketDetail } from "@/components/support/SupportTicketDetail";

/** `/support/:id` — protected; also gated server-side by `support.read` (and `support.respond`/`support.refund` for the mutating actions on this screen). */
export default function SupportTicketPage({ params }: { params: { id: string } }) {
  return (
    <RequireAdminAuth>
      <SupportTicketDetail ticketId={params.id} />
    </RequireAdminAuth>
  );
}
