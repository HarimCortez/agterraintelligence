"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addSupportTicketMessage, fetchSupportTicket, supportTicketQueryKey } from "@/lib/support-api";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";

export function SupportTicketDetail({ ticketId }: { ticketId: string }) {
  const query = useQuery({ queryKey: supportTicketQueryKey(ticketId), queryFn: () => fetchSupportTicket(ticketId) });
  const handleUnauthorized = useHandleUnauthorized();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const replyMutation = useMutation({
    mutationFn: () => addSupportTicketMessage(ticketId, reply.trim()),
    onSuccess: () => {
      setReply("");
      void queryClient.invalidateQueries({ queryKey: supportTicketQueryKey(ticketId) });
    },
    onError: (error) => handleUnauthorized(error),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (reply.trim()) replyMutation.mutate();
  };

  return (
    <div className="p-xl">
      <Link href="/support" className="mb-lg inline-block text-sm text-action-primary underline">
        ← Back to Support
      </Link>

      {query.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      {query.isError && (
        <p className="text-sm text-text-secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load this ticket."}
        </p>
      )}

      {query.isSuccess && (
        <>
          <header className="mb-lg flex items-center justify-between gap-md">
            <h1 className="text-2xl font-semibold text-text-primary">{query.data.subject}</h1>
            <span className="rounded border border-border-default px-sm py-xs text-xs capitalize text-text-secondary">
              {query.data.status.replace(/_/g, " ")}
            </span>
          </header>

          <div className="mb-lg flex flex-col gap-md">
            {query.data.messages.map((message) => (
              <div
                key={message.id}
                className={`rounded border border-border-subtle p-md ${
                  message.senderType === "admin" ? "bg-surface" : "bg-workspace-bg"
                }`}
              >
                <p className="mb-xs text-xs font-semibold text-text-secondary">
                  {message.senderType === "admin" ? "AgTerra Support" : "You"} ·{" "}
                  {new Date(message.createdAt).toLocaleString("en-US")}
                </p>
                <p className="whitespace-pre-wrap text-sm text-text-primary">{message.body}</p>
              </div>
            ))}
          </div>

          {query.data.status === "closed" ? (
            <p className="text-sm text-text-secondary">
              This ticket is closed. Please file a new ticket if you have a follow-up question.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
              <textarea
                placeholder="Write a reply…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={5000}
                rows={3}
                className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
              {replyMutation.isError && (
                <p className="text-sm text-text-secondary">
                  {replyMutation.error instanceof Error ? replyMutation.error.message : "Something went wrong."}
                </p>
              )}
              <button
                type="submit"
                disabled={replyMutation.isPending || !reply.trim()}
                className="self-start rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {replyMutation.isPending ? "Sending…" : "Send reply"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
