"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { adminSupportTicketsQueryKey, fetchAdminSupportTickets, type SupportTicketStatus } from "@/lib/admin-support-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;
const STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

/**
 * `/support` — Support Center (REQUIREMENTS.md Section 6/10.2): ticket
 * table filterable by status, each linking to its full conversation.
 */
export function SupportWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [status, setStatus] = useState<SupportTicketStatus | "">("");
  const [offset, setOffset] = useState(0);

  const params = { status: status || undefined, limit: PAGE_SIZE, offset };
  const query = useQuery({
    queryKey: adminSupportTicketsQueryKey(params),
    queryFn: () => fetchAdminSupportTickets(params),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  if (query.isError && query.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {query.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Support Center</h1>
        <p className="text-sm text-text-secondary">Ticket conversations, internal notes, and order refunds.</p>
      </header>

      <div className="mb-md flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Tickets</h2>
        <select
          className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SupportTicketStatus | "");
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatEnumLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">Subject</th>
              <th className="px-md py-sm">User</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Assigned</th>
              <th className="px-md py-sm">Updated</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {query.isSuccess && query.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={5}>
                  No tickets match these filters.
                </td>
              </tr>
            )}
            {query.isSuccess &&
              query.data.results.map((ticket) => (
                <tr key={ticket.id} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-md py-sm text-text-primary">
                    <Link href={`/support/${ticket.id}`} className="text-action-primary underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-md py-sm text-text-primary">{ticket.userEmail}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(ticket.status)}</td>
                  <td className="px-md py-sm text-text-secondary">{ticket.assignedAdminEmail ?? "Unassigned"}</td>
                  <td className="px-md py-sm text-text-secondary">{formatDate(ticket.updatedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {(query.data?.total ?? 0) > 0 && (
        <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, query.data!.total)} of {query.data!.total}
          </span>
          <div className="flex gap-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= query.data!.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
