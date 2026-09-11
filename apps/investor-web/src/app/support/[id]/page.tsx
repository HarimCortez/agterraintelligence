import { RequireAuth } from "@/components/auth/RequireAuth";
import { SupportTicketDetail } from "@/components/support/SupportTicketDetail";

interface SupportTicketPageProps {
  params: { id: string };
}

/**
 * `/support/[id]` — protected route. Client-only (no server-side prefetch)
 * like `/support` itself: ticket data is per-user and requires a bearer
 * token the server component has no access to.
 */
export default function SupportTicketPage({ params }: SupportTicketPageProps) {
  return (
    <RequireAuth>
      <SupportTicketDetail ticketId={params.id} />
    </RequireAuth>
  );
}
