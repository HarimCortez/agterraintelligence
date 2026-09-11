"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminAuditLogQueryKey, fetchAdminAuditLog } from "@/lib/admin-audit-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 50;

const KNOWN_ACTIONS = ["admin.login.success", "admin.login.failed", "fulfillment.retry"];

/**
 * `/audit` — Audit Logs (REQUIREMENTS.md Section 10.2). See
 * `packages/db/prisma/schema.prisma`'s `AuditLogEntry` doc comment for
 * what actually writes entries today: admin login attempts (success and
 * failure) and the Report Fulfillment retry action. This is a real,
 * working audit trail for those two things — not a placeholder for a
 * larger "log everything" system that doesn't exist yet. New admin
 * mutations should get their own `auditLog.record(...)` call as they're
 * built, the same way fulfillment.retry did.
 */
export function AuditLogWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [actorEmailInput, setActorEmailInput] = useState("");
  const [offset, setOffset] = useState(0);

  const params = { action: action || undefined, actorEmail: actorEmail || undefined, limit: PAGE_SIZE, offset };
  const query = useQuery({
    queryKey: adminAuditLogQueryKey(params),
    queryFn: () => fetchAdminAuditLog(params),
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

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActorEmail(actorEmailInput.trim());
    setOffset(0);
  };

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Audit Log</h1>
        <p className="text-sm text-text-secondary">Admin login attempts and fulfillment retry actions.</p>
      </header>

      <div className="mb-md flex flex-wrap items-center gap-sm">
        <select
          className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All actions</option>
          {KNOWN_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <form onSubmit={handleSearchSubmit} className="flex gap-sm">
          <input
            type="text"
            placeholder="Search by actor email…"
            value={actorEmailInput}
            onChange={(e) => setActorEmailInput(e.target.value)}
            className="rounded border border-border-default bg-surface px-sm py-xs text-sm text-text-primary"
          />
          <button
            type="submit"
            className="rounded border border-border-default px-sm py-xs text-sm font-semibold text-text-primary hover:bg-workspace-bg"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">Time</th>
              <th className="px-md py-sm">Action</th>
              <th className="px-md py-sm">Actor</th>
              <th className="px-md py-sm">Target</th>
              <th className="px-md py-sm">Details</th>
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
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {query.isSuccess &&
              query.data.results.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-b-0 align-top">
                  <td className="whitespace-nowrap px-md py-sm text-text-secondary">
                    {new Date(row.createdAt).toLocaleString("en-US")}
                  </td>
                  <td className="px-md py-sm text-text-primary">{row.action}</td>
                  <td className="px-md py-sm text-text-primary">{row.actorEmail ?? "—"}</td>
                  <td className="px-md py-sm text-text-secondary">
                    {row.targetType ? `${row.targetType}:${row.targetId}` : "—"}
                  </td>
                  <td className="max-w-[320px] truncate px-md py-sm text-xs text-text-secondary" title={JSON.stringify(row.metadata)}>
                    {row.metadata ? JSON.stringify(row.metadata) : "—"}
                  </td>
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
