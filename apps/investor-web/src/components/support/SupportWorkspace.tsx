"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupportTicket, fetchSupportTickets, supportTicketsQueryKey } from "@/lib/support-api";
import { useHandleUnauthorized } from "@/lib/use-handle-unauthorized";

/**
 * `/support` — lists the current user's tickets and lets them file a new
 * one. Kept to subject + message for v1 — no related-order/property picker
 * yet (the backend already accepts `relatedReportOrderId`/`relatedPropertyId`
 * for a future "Contact support about this order" entry point elsewhere in
 * the app; this screen doesn't need to be that entry point to be real).
 */
export function SupportWorkspace() {
  const query = useQuery({ queryKey: supportTicketsQueryKey, queryFn: fetchSupportTickets });
  const handleUnauthorized = useHandleUnauthorized();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const createMutation = useMutation({
    mutationFn: () => createSupportTicket({ subject: subject.trim(), body: body.trim() }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: supportTicketsQueryKey });
    },
    onError: (error) => handleUnauthorized(error),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim() && body.trim()) createMutation.mutate();
  };

  const tickets = query.data?.tickets ?? [];

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Support</h1>
        <p className="text-sm text-text-secondary">
          Questions about billing, a report, or something on the platform — file a ticket and we&apos;ll follow up
          here.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-xl flex flex-col gap-sm rounded border border-border-subtle bg-surface p-lg"
      >
        <h2 className="text-md font-semibold text-text-primary">New ticket</h2>
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
        />
        <textarea
          placeholder="Describe your question or issue…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={4}
          className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
        />
        {createMutation.isError && (
          <p className="text-sm text-text-secondary">
            {createMutation.error instanceof Error ? createMutation.error.message : "Something went wrong."}
          </p>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending || !subject.trim() || !body.trim()}
          className="self-start rounded bg-action-primary px-md py-sm text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {createMutation.isPending ? "Submitting…" : "Submit ticket"}
        </button>
      </form>

      {query.isPending && <p className="text-sm text-text-secondary">Loading…</p>}
      {query.isError && (
        <p className="text-sm text-text-secondary">
          {query.error instanceof Error ? query.error.message : "Couldn't load your tickets."}
        </p>
      )}
      {query.isSuccess && tickets.length === 0 && (
        <p className="text-sm text-text-secondary">You haven&apos;t filed any tickets yet.</p>
      )}

      {tickets.length > 0 && (
        <div className="flex flex-col gap-sm">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/support/${ticket.id}`}
              className="flex items-center justify-between rounded border border-border-subtle bg-surface p-md hover:bg-workspace-bg"
            >
              <div>
                <p className="text-sm font-semibold text-text-primary">{ticket.subject}</p>
                <p className="text-xs text-text-secondary">
                  Updated {new Date(ticket.updatedAt).toLocaleDateString("en-US")}
                </p>
              </div>
              <span className="rounded border border-border-default px-sm py-xs text-xs capitalize text-text-secondary">
                {ticket.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
