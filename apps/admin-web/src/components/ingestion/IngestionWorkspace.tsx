"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIngestionRunsQueryKey, fetchAdminIngestionRuns, triggerFemaFloodZoneRun } from "@/lib/admin-ingestion-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;

/**
 * `/data-sources` — Data Sources & Ingestion Monitor. Unlike the other
 * admin modules, there is no scheduled/background ingestion pipeline in
 * this deployment — this screen shows the real run history of, and lets an
 * admin manually trigger, the one real ingestion job that exists: FEMA
 * flood zone data. See `apps/api/src/ingestion/fema-flood-zone-ingestion.service.ts`'s
 * doc comment for why this is manually triggered rather than scheduled.
 */
export function IngestionWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);

  const params = { limit: PAGE_SIZE, offset };
  const query = useQuery({
    queryKey: adminIngestionRunsQueryKey(params),
    queryFn: () => fetchAdminIngestionRuns(params),
    // The trigger endpoint returns as soon as the run starts (see
    // fema-flood-zone-ingestion.service.ts's doc comment — a synchronous
    // wait tripped the dev proxy's own timeout during real testing), so
    // poll while anything on this page is still "running" to reflect its
    // real completion without a manual refresh.
    refetchInterval: (q) => (q.state.data?.results.some((run) => run.status === "running") ? 2000 : false),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  const triggerMutation = useMutation({
    mutationFn: () => triggerFemaFloodZoneRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const runInProgress = query.data?.results.some((run) => run.status === "running") ?? false;

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
      <header className="mb-lg flex items-start justify-between gap-md">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Data Sources &amp; Ingestion</h1>
          <p className="text-sm text-text-secondary">
            FEMA National Flood Hazard Layer — real, manually-triggered ingestion runs. No other data sources have a
            live ingestion pipeline yet.
          </p>
        </div>
        <button
          type="button"
          disabled={triggerMutation.isPending || runInProgress}
          onClick={() => triggerMutation.mutate()}
          className="whitespace-nowrap rounded bg-action-primary px-md py-sm text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerMutation.isPending || runInProgress ? "Running…" : "Run FEMA Flood Zone Sync"}
        </button>
      </header>

      {triggerMutation.isError && !(triggerMutation.error instanceof ForbiddenError) && (
        <div className="mb-md rounded border border-border-subtle bg-surface p-sm text-sm text-text-secondary">
          {triggerMutation.error instanceof Error ? triggerMutation.error.message : "Failed to trigger the run."}
        </div>
      )}
      {triggerMutation.isSuccess && (
        <div className="mb-md rounded border border-border-subtle bg-surface p-sm text-sm text-text-secondary">
          Run started — this table updates automatically until it finishes.
        </div>
      )}

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">Started</th>
              <th className="px-md py-sm">Source</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Properties checked</th>
              <th className="px-md py-sm">Flags created</th>
              <th className="px-md py-sm">Error</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {query.isSuccess && query.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  No ingestion runs yet — trigger one above.
                </td>
              </tr>
            )}
            {query.isSuccess &&
              query.data.results.map((run) => (
                <tr key={run.id} className="border-b border-border-subtle last:border-b-0 align-top">
                  <td className="whitespace-nowrap px-md py-sm text-text-secondary">
                    {new Date(run.startedAt).toLocaleString("en-US")}
                  </td>
                  <td className="px-md py-sm text-text-primary">{run.source}</td>
                  <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(run.status)}</td>
                  <td className="px-md py-sm text-text-primary">{run.propertiesChecked}</td>
                  <td className="px-md py-sm text-text-primary">{run.flagsCreated}</td>
                  <td className="max-w-[320px] truncate px-md py-sm text-xs text-text-secondary" title={run.errorMessage ?? undefined}>
                    {run.errorMessage ?? "—"}
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
