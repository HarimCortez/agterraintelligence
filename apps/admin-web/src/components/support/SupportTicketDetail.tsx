"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addAdminSupportMessage,
  adminSupportTicketQueryKey,
  fetchAdminSupportTicket,
  refundAdminSupportTicketOrder,
  updateAdminSupportTicketStatus,
  type SupportTicketStatus,
} from "@/lib/admin-support-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatCurrencyFromCents, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const STATUSES: SupportTicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export function SupportTicketDetail({ ticketId }: { ticketId: string }) {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminSupportTicketQueryKey(ticketId),
    queryFn: () => fetchAdminSupportTicket(ticketId),
  });

  const [reply, setReply] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminSupportTicketQueryKey(ticketId) });

  const replyMutation = useMutation({
    mutationFn: () => addAdminSupportMessage(ticketId, { body: reply.trim(), isInternalNote }),
    onSuccess: () => {
      setReply("");
      setIsInternalNote(false);
      invalidate();
    },
    onError: handleUnauthorized,
  });

  const statusMutation = useMutation({
    mutationFn: (status: SupportTicketStatus) => updateAdminSupportTicketStatus(ticketId, status),
    onSuccess: invalidate,
    onError: handleUnauthorized,
  });

  const refundMutation = useMutation({
    mutationFn: () => refundAdminSupportTicketOrder(ticketId),
    onSuccess: invalidate,
    onError: handleUnauthorized,
  });

  if (query.isError && query.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {query.error.message}
        </div>
      </div>
    );
  }

  const handleReplySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (reply.trim()) replyMutation.mutate();
  };

  const ticket = query.data;

  return (
    <div className="p-xl">
      <Link href="/support" className="mb-lg inline-block text-sm text-action-primary underline">
        ← Back to Support Center
      </Link>

      {query.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      {query.isError && !(query.error instanceof ForbiddenError) && (
        <p className="text-sm text-text-secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load this ticket."}
        </p>
      )}

      {ticket && (
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-[2fr_1fr]">
          <div>
            <header className="mb-lg flex items-center justify-between gap-md">
              <h1 className="text-2xl font-semibold text-text-primary">{ticket.subject}</h1>
              <select
                value={ticket.status}
                disabled={statusMutation.isPending}
                onChange={(e) => statusMutation.mutate(e.target.value as SupportTicketStatus)}
                className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatEnumLabel(s)}
                  </option>
                ))}
              </select>
            </header>

            <div className="mb-lg flex flex-col gap-md">
              {ticket.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded border p-md ${
                    message.isInternalNote
                      ? "border-dashed border-border-default bg-workspace-bg"
                      : "border-border-subtle bg-surface"
                  }`}
                >
                  <p className="mb-xs text-xs font-semibold text-text-secondary">
                    {message.isInternalNote ? "Internal note" : message.senderType === "admin" ? "Support" : "User"}
                    {message.senderEmail ? ` (${message.senderEmail})` : ""} ·{" "}
                    {new Date(message.createdAt).toLocaleString("en-US")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{message.body}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleReplySubmit} className="flex flex-col gap-sm">
              <textarea
                placeholder={isInternalNote ? "Write an internal note (not visible to the user)…" : "Write a reply…"}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={5000}
                rows={3}
                className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
              <label className="flex items-center gap-xs text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                />
                Internal note (not visible to the user)
              </label>
              {replyMutation.isError && !(replyMutation.error instanceof ForbiddenError) && (
                <p className="text-sm text-text-secondary">
                  {replyMutation.error instanceof Error ? replyMutation.error.message : "Something went wrong."}
                </p>
              )}
              <button
                type="submit"
                disabled={replyMutation.isPending || !reply.trim()}
                className="self-start rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {replyMutation.isPending ? "Sending…" : isInternalNote ? "Add note" : "Send reply"}
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-md">
            <div className="rounded border border-border-subtle bg-surface p-lg">
              <h2 className="mb-sm text-sm font-semibold text-text-primary">User</h2>
              <p className="text-sm text-text-primary">{ticket.user.email}</p>
              <p className="text-xs text-text-secondary">
                {formatEnumLabel(ticket.user.externalRole)} · {formatEnumLabel(ticket.user.status)}
              </p>
            </div>

            {ticket.relatedProperty && (
              <div className="rounded border border-border-subtle bg-surface p-lg">
                <h2 className="mb-sm text-sm font-semibold text-text-primary">Related property</h2>
                <p className="text-sm text-text-primary">{ticket.relatedProperty.address}</p>
                <p className="text-xs text-text-secondary">{ticket.relatedProperty.county} County</p>
              </div>
            )}

            {ticket.relatedReportOrder && (
              <div className="rounded border border-border-subtle bg-surface p-lg">
                <h2 className="mb-sm text-sm font-semibold text-text-primary">Related order</h2>
                <p className="text-sm text-text-primary">
                  {formatEnumLabel(ticket.relatedReportOrder.reportTierCode)} report —{" "}
                  {formatCurrencyFromCents(ticket.relatedReportOrder.pricePaidCents)}
                </p>
                <p className="mb-sm text-xs text-text-secondary">{formatEnumLabel(ticket.relatedReportOrder.status)}</p>

                {ticket.relatedReportOrder.status === "refunded" ? (
                  <p className="text-xs text-text-secondary">Already refunded.</p>
                ) : !ticket.relatedReportOrder.hasPaymentToRefund ? (
                  <p className="text-xs text-text-secondary">This order was never paid — nothing to refund.</p>
                ) : (
                  <button
                    type="button"
                    disabled={refundMutation.isPending}
                    onClick={() => refundMutation.mutate()}
                    className="rounded border border-border-default px-sm py-xs text-xs font-semibold text-text-primary hover:bg-workspace-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refundMutation.isPending ? "Refunding…" : "Issue refund"}
                  </button>
                )}
                {refundMutation.isError && !(refundMutation.error instanceof ForbiddenError) && (
                  <p className="mt-xs text-xs text-text-secondary">
                    {refundMutation.error instanceof Error ? refundMutation.error.message : "Refund failed."}
                  </p>
                )}
                {refundMutation.isSuccess && <p className="mt-xs text-xs text-text-secondary">Refund issued.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
