"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminIngestionRunsQueryKey,
  adminParcelRecordsQueryKey,
  fetchAdminIngestionRuns,
  fetchAdminParcelRecords,
  triggerFemaFloodZoneRun,
  triggerFlParcelRun,
  triggerUsdaSoilRun,
  triggerWetlandsRun,
  triggerCitrusQuarantineRun,
  triggerCroplandCoverRun,
} from "@/lib/admin-ingestion-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;

/**
 * `/data-sources` — Data Sources & Ingestion Monitor. Unlike the other
 * admin modules, there is no scheduled/background ingestion pipeline in
 * this deployment — this screen shows the real run history of, and lets an
 * admin manually trigger, the six real ingestion jobs that exist: FEMA
 * flood zone data, the FL DOR parcel cadastral sweep, USDA NRCS soil data,
 * USFWS wetlands data, USDA APHIS citrus greening quarantine data, and the
 * USDA NASS Cropland Data Layer. See
 * `apps/api/src/ingestion/fema-flood-zone-ingestion.service.ts`,
 * `fl-parcel-cadastral-ingestion.service.ts`, `usda-soil-ingestion.service.ts`,
 * `wetlands-ingestion.service.ts`, `citrus-quarantine-ingestion.service.ts`,
 * and `cropland-cover-ingestion.service.ts`'s doc comments for why all six
 * are manually triggered rather than scheduled.
 */
export function IngestionWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [parcelOffset, setParcelOffset] = useState(0);

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

  const parcelParams = { limit: PAGE_SIZE, offset: parcelOffset };
  const parcelQuery = useQuery({
    queryKey: adminParcelRecordsQueryKey(parcelParams),
    queryFn: () => fetchAdminParcelRecords(parcelParams),
  });

  useEffect(() => {
    if (query.error) handleUnauthorized(query.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);

  useEffect(() => {
    if (parcelQuery.error) handleUnauthorized(parcelQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelQuery.error]);

  const triggerFemaMutation = useMutation({
    mutationFn: () => triggerFemaFloodZoneRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerParcelMutation = useMutation({
    mutationFn: () => triggerFlParcelRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "parcels"] });
    },
    onError: handleUnauthorized,
  });

  const triggerSoilMutation = useMutation({
    mutationFn: () => triggerUsdaSoilRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerWetlandsMutation = useMutation({
    mutationFn: () => triggerWetlandsRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerCitrusMutation = useMutation({
    mutationFn: () => triggerCitrusQuarantineRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerCropCoverMutation = useMutation({
    mutationFn: () => triggerCroplandCoverRun(),
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
            FEMA National Flood Hazard Layer, the Florida DOR parcel cadastral sweep, USDA NRCS soil data, USFWS
            wetlands data, and USDA APHIS citrus greening quarantine data — real, manually-triggered ingestion runs.
            No other data sources have a live ingestion pipeline yet.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-sm">
          <button
            type="button"
            disabled={triggerFemaMutation.isPending || runInProgress}
            onClick={() => triggerFemaMutation.mutate()}
            className="whitespace-nowrap rounded bg-action-primary px-md py-sm text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerFemaMutation.isPending || runInProgress ? "Running…" : "Run FEMA Flood Zone Sync"}
          </button>
          <button
            type="button"
            disabled={triggerParcelMutation.isPending || runInProgress}
            onClick={() => triggerParcelMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerParcelMutation.isPending || runInProgress ? "Running…" : "Run FL Parcel Sync"}
          </button>
          <button
            type="button"
            disabled={triggerSoilMutation.isPending || runInProgress}
            onClick={() => triggerSoilMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerSoilMutation.isPending || runInProgress ? "Running…" : "Run USDA Soil Sync"}
          </button>
          <button
            type="button"
            disabled={triggerWetlandsMutation.isPending || runInProgress}
            onClick={() => triggerWetlandsMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerWetlandsMutation.isPending || runInProgress ? "Running…" : "Run Wetlands Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCitrusMutation.isPending || runInProgress}
            onClick={() => triggerCitrusMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCitrusMutation.isPending || runInProgress ? "Running…" : "Run Citrus Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCropCoverMutation.isPending || runInProgress}
            onClick={() => triggerCropCoverMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCropCoverMutation.isPending || runInProgress ? "Running…" : "Run Cropland Cover Sync"}
          </button>
        </div>
      </header>

      {[
        triggerFemaMutation,
        triggerParcelMutation,
        triggerSoilMutation,
        triggerWetlandsMutation,
        triggerCitrusMutation,
        triggerCropCoverMutation,
      ].map(
        (mutation, i) =>
          mutation.isError &&
          !(mutation.error instanceof ForbiddenError) && (
            <div key={i} className="mb-md rounded border border-border-subtle bg-surface p-sm text-sm text-text-secondary">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to trigger the run."}
            </div>
          ),
      )}
      {(triggerFemaMutation.isSuccess ||
        triggerParcelMutation.isSuccess ||
        triggerSoilMutation.isSuccess ||
        triggerWetlandsMutation.isSuccess ||
        triggerCitrusMutation.isSuccess ||
        triggerCropCoverMutation.isSuccess) && (
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
              <th className="px-md py-sm">Items processed</th>
              <th className="px-md py-sm">Records created</th>
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
                  <td className="px-md py-sm text-text-primary">{run.itemsProcessed}</td>
                  <td className="px-md py-sm text-text-primary">{run.recordsCreated}</td>
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

      <h2 className="mb-sm mt-2xl text-lg font-semibold text-text-primary">Ingested Parcels</h2>
      <p className="mb-md text-sm text-text-secondary">
        Real agricultural parcels from the FL DOR cadastral sweep (DeSoto, Hardee, Highlands, Polk — Okeechobee not
        yet covered, see the ingestion service&apos;s doc comment). Tax-assessed values, not market appraisals.
      </p>

      <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
              <th className="px-md py-sm">County</th>
              <th className="px-md py-sm">Parcel ID</th>
              <th className="px-md py-sm">Owner</th>
              <th className="px-md py-sm">Use</th>
              <th className="px-md py-sm">Acreage</th>
              <th className="px-md py-sm">Assessed value</th>
            </tr>
          </thead>
          <tbody>
            {parcelQuery.isPending && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {parcelQuery.isSuccess && parcelQuery.data.results.length === 0 && (
              <tr>
                <td className="px-md py-md text-text-secondary" colSpan={6}>
                  No parcels ingested yet — run the FL Parcel Sync above.
                </td>
              </tr>
            )}
            {parcelQuery.isSuccess &&
              parcelQuery.data.results.map((parcel) => (
                <tr key={parcel.id} className="border-b border-border-subtle last:border-b-0 align-top">
                  <td className="whitespace-nowrap px-md py-sm text-text-primary">{parcel.county}</td>
                  <td className="px-md py-sm text-text-secondary">{parcel.parcelId}</td>
                  <td className="px-md py-sm text-text-primary">{parcel.ownerName ?? "—"}</td>
                  <td className="px-md py-sm text-text-primary" title={parcel.dorUseDescription}>
                    {parcel.dorUseDescription}
                  </td>
                  <td className="px-md py-sm text-text-primary">{parcel.acreage}</td>
                  <td className="px-md py-sm text-text-primary">
                    {(parcel.justValueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {(parcelQuery.data?.total ?? 0) > 0 && (
        <div className="mt-sm flex items-center justify-between text-sm text-text-secondary">
          <span>
            {parcelOffset + 1}–{Math.min(parcelOffset + PAGE_SIZE, parcelQuery.data!.total)} of{" "}
            {parcelQuery.data!.total}
          </span>
          <div className="flex gap-sm">
            <button
              type="button"
              disabled={parcelOffset === 0}
              onClick={() => setParcelOffset(Math.max(0, parcelOffset - PAGE_SIZE))}
              className="rounded border border-border-default px-sm py-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={parcelOffset + PAGE_SIZE >= parcelQuery.data!.total}
              onClick={() => setParcelOffset(parcelOffset + PAGE_SIZE)}
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
