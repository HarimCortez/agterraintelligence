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
  triggerCitrusBlackSpotRun,
  triggerCroplandCoverRun,
  triggerNassAgCensusRun,
  triggerFiaTimberRun,
  triggerRmaCauseOfLossRun,
  triggerErsCountyEconomicRun,
  triggerUsdaRdEligibilityRun,
  triggerUsdaForestHealthRun,
  triggerFireAntQuarantineRun,
  triggerSpongyMothQuarantineRun,
  triggerAsianLonghornedBeetleQuarantineRun,
  triggerSuddenOakDeathQuarantineRun,
  triggerEmeraldAshBorerRun,
  triggerHpaiDairyCattleRun,
  triggerAsianLonghornedTickRun,
  triggerCitrusCankerRun,
  triggerAsianCitrusPsyllidRun,
  triggerSweetOrangeScabRun,
  triggerErsCountyTypologyRun,
} from "@/lib/admin-ingestion-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

const PAGE_SIZE = 20;

/**
 * `/data-sources` — Data Sources & Ingestion Monitor. Unlike the other
 * admin modules, there is no scheduled/background ingestion pipeline in
 * this deployment — this screen shows the real run history of, and lets an
 * admin manually trigger, the twenty-four real ingestion jobs that exist: FEMA
 * flood zone data, the FL DOR parcel cadastral sweep, USDA NRCS soil data,
 * USFWS wetlands data, USDA APHIS Citrus Greening (HLB) quarantine data,
 * USDA APHIS Citrus Black Spot quarantine data, the USDA NASS Cropland
 * Data Layer, the USDA NASS Census of Agriculture (this one runs
 * noticeably longer than the others — it streams and parses a ~300MB
 * bulk file rather than making a live per-property query, see
 * `nass-ag-census-ingestion.service.ts`'s doc comment), the USDA Forest
 * Service Forest Inventory and Analysis program (timber properties only
 * — see `fia-timber-ingestion.service.ts`'s doc comment), the USDA
 * Risk Management Agency's federal crop insurance Cause of Loss data
 * (see `rma-cause-of-loss-ingestion.service.ts`'s doc comment), and the
 * USDA ERS County-level Data Sets (population growth, unemployment,
 * income — see `ers-county-economic-ingestion.service.ts`'s doc
 * comment), the USDA Rural Development Eligibility MapServer (real-
 * estate financing context — see
 * `usda-rd-eligibility-ingestion.service.ts`'s doc comment), and the USDA
 * Forest Service Insect & Disease Survey (real aerial-detected forest
 * pest/disease damage near timber properties — see
 * `usda-forest-health-ingestion.service.ts`'s doc comment), and the USDA
 * APHIS Imported Fire Ant quarantine (same underlying federal quarantine
 * dataset as the citrus jobs, swept across every property — see
 * `fire-ant-quarantine-ingestion.service.ts`'s doc comment), and the USDA
 * APHIS Spongy Moth quarantine (the largest real program on that same
 * quarantine layer, 620 county-level records nationwide, scoped to timber
 * properties — see `spongy-moth-quarantine-ingestion.service.ts`'s doc
 * comment), the USDA APHIS Asian Longhorned Beetle quarantine (the
 * first of the quarantine jobs to filter `Quarantine_Status`
 * server-side — see `asian-longhorned-beetle-quarantine-ingestion.service.ts`'s
 * doc comment), and the USDA APHIS Phytophthora ramorum (Sudden Oak Death)
 * quarantine (real West Coast forest pathogen coverage, scoped to timber
 * properties — see `sudden-oak-death-quarantine-ingestion.service.ts`'s
 * doc comment). See `apps/api/src/ingestion/fema-flood-zone-ingestion.service.ts`,
 * `fl-parcel-cadastral-ingestion.service.ts`, `usda-soil-ingestion.service.ts`,
 * `wetlands-ingestion.service.ts`, `citrus-quarantine-ingestion.service.ts`,
 * `citrus-black-spot-ingestion.service.ts`, `cropland-cover-ingestion.service.ts`,
 * `nass-ag-census-ingestion.service.ts`, `fia-timber-ingestion.service.ts`,
 * `rma-cause-of-loss-ingestion.service.ts`,
 * `ers-county-economic-ingestion.service.ts`,
 * `usda-rd-eligibility-ingestion.service.ts`,
 * `usda-forest-health-ingestion.service.ts`,
 * `fire-ant-quarantine-ingestion.service.ts`,
 * `spongy-moth-quarantine-ingestion.service.ts`,
 * `asian-longhorned-beetle-quarantine-ingestion.service.ts`,
 * `sudden-oak-death-quarantine-ingestion.service.ts`,
 * `emerald-ash-borer-ingestion.service.ts` (a different APHIS FeatureServer
 * discovered via APHIS's public ArcGIS service catalog — a historical
 * "known infested" record, not an active quarantine status), and
 * `hpai-dairy-cattle-ingestion.service.ts` (the first state-level, not
 * county-level, source in this list, and the first covering livestock
 * disease rather than a plant/forest pest), and
 * `asian-longhorned-tick-ingestion.service.ts` (a real, currently
 * expanding invasive livestock pest with a real established/reported
 * severity split), and `citrus-canker-ingestion.service.ts` (a
 * different, broader APHIS quarantine FeatureServer than the one behind
 * the HLB and Citrus Black Spot jobs, and the rare recent source where
 * every seed county is real, currently-quarantined), and
 * `asian-citrus-psyllid-ingestion.service.ts` (a different sub-layer of
 * that same service, covering the actual insect vector for HLB rather
 * than the disease itself), and `sweet-orange-scab-ingestion.service.ts`
 * (the third and final sub-layer of that same service, scored one
 * severity tier below the other three Florida citrus quarantine flags),
 * and `ers-county-typology-ingestion.service.ts` (a different ERS host
 * than the county economic job, updating that job's existing summary
 * row rather than creating a new table)'s doc comments for why all
 * twenty-four are manually triggered rather than scheduled.
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

  const triggerBlackSpotMutation = useMutation({
    mutationFn: () => triggerCitrusBlackSpotRun(),
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

  const triggerAgCensusMutation = useMutation({
    mutationFn: () => triggerNassAgCensusRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerTimberMutation = useMutation({
    mutationFn: () => triggerFiaTimberRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerCropLossMutation = useMutation({
    mutationFn: () => triggerRmaCauseOfLossRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerCountyEconomicMutation = useMutation({
    mutationFn: () => triggerErsCountyEconomicRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerRdEligibilityMutation = useMutation({
    mutationFn: () => triggerUsdaRdEligibilityRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerForestHealthMutation = useMutation({
    mutationFn: () => triggerUsdaForestHealthRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerFireAntMutation = useMutation({
    mutationFn: () => triggerFireAntQuarantineRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerSpongyMothMutation = useMutation({
    mutationFn: () => triggerSpongyMothQuarantineRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerAsianLonghornedBeetleMutation = useMutation({
    mutationFn: () => triggerAsianLonghornedBeetleQuarantineRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerSuddenOakDeathMutation = useMutation({
    mutationFn: () => triggerSuddenOakDeathQuarantineRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerEmeraldAshBorerMutation = useMutation({
    mutationFn: () => triggerEmeraldAshBorerRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerHpaiDairyCattleMutation = useMutation({
    mutationFn: () => triggerHpaiDairyCattleRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerAsianLonghornedTickMutation = useMutation({
    mutationFn: () => triggerAsianLonghornedTickRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerCitrusCankerMutation = useMutation({
    mutationFn: () => triggerCitrusCankerRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerAsianCitrusPsyllidMutation = useMutation({
    mutationFn: () => triggerAsianCitrusPsyllidRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerSweetOrangeScabMutation = useMutation({
    mutationFn: () => triggerSweetOrangeScabRun(),
    onSuccess: () => {
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ["admin-ingestion", "runs"] });
    },
    onError: handleUnauthorized,
  });

  const triggerErsCountyTypologyMutation = useMutation({
    mutationFn: () => triggerErsCountyTypologyRun(),
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
            disabled={triggerBlackSpotMutation.isPending || runInProgress}
            onClick={() => triggerBlackSpotMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerBlackSpotMutation.isPending || runInProgress ? "Running…" : "Run Citrus Black Spot Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCropCoverMutation.isPending || runInProgress}
            onClick={() => triggerCropCoverMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCropCoverMutation.isPending || runInProgress ? "Running…" : "Run Cropland Cover Sync"}
          </button>
          <button
            type="button"
            disabled={triggerAgCensusMutation.isPending || runInProgress}
            onClick={() => triggerAgCensusMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerAgCensusMutation.isPending || runInProgress ? "Running…" : "Run NASS Ag Census Sync"}
          </button>
          <button
            type="button"
            disabled={triggerTimberMutation.isPending || runInProgress}
            onClick={() => triggerTimberMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerTimberMutation.isPending || runInProgress ? "Running…" : "Run FIA Timber Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCropLossMutation.isPending || runInProgress}
            onClick={() => triggerCropLossMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCropLossMutation.isPending || runInProgress ? "Running…" : "Run RMA Cause of Loss Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCountyEconomicMutation.isPending || runInProgress}
            onClick={() => triggerCountyEconomicMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCountyEconomicMutation.isPending || runInProgress ? "Running…" : "Run ERS County Economic Sync"}
          </button>
          <button
            type="button"
            disabled={triggerRdEligibilityMutation.isPending || runInProgress}
            onClick={() => triggerRdEligibilityMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerRdEligibilityMutation.isPending || runInProgress ? "Running…" : "Run USDA RD Eligibility Sync"}
          </button>
          <button
            type="button"
            disabled={triggerForestHealthMutation.isPending || runInProgress}
            onClick={() => triggerForestHealthMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerForestHealthMutation.isPending || runInProgress ? "Running…" : "Run USDA Forest Health Sync"}
          </button>
          <button
            type="button"
            disabled={triggerFireAntMutation.isPending || runInProgress}
            onClick={() => triggerFireAntMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerFireAntMutation.isPending || runInProgress ? "Running…" : "Run Fire Ant Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerSpongyMothMutation.isPending || runInProgress}
            onClick={() => triggerSpongyMothMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerSpongyMothMutation.isPending || runInProgress ? "Running…" : "Run Spongy Moth Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerAsianLonghornedBeetleMutation.isPending || runInProgress}
            onClick={() => triggerAsianLonghornedBeetleMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerAsianLonghornedBeetleMutation.isPending || runInProgress
              ? "Running…"
              : "Run Asian Longhorned Beetle Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerSuddenOakDeathMutation.isPending || runInProgress}
            onClick={() => triggerSuddenOakDeathMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerSuddenOakDeathMutation.isPending || runInProgress ? "Running…" : "Run Sudden Oak Death Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerEmeraldAshBorerMutation.isPending || runInProgress}
            onClick={() => triggerEmeraldAshBorerMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerEmeraldAshBorerMutation.isPending || runInProgress ? "Running…" : "Run Emerald Ash Borer Sync"}
          </button>
          <button
            type="button"
            disabled={triggerHpaiDairyCattleMutation.isPending || runInProgress}
            onClick={() => triggerHpaiDairyCattleMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerHpaiDairyCattleMutation.isPending || runInProgress ? "Running…" : "Run HPAI Dairy Cattle Sync"}
          </button>
          <button
            type="button"
            disabled={triggerAsianLonghornedTickMutation.isPending || runInProgress}
            onClick={() => triggerAsianLonghornedTickMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerAsianLonghornedTickMutation.isPending || runInProgress ? "Running…" : "Run Asian Longhorned Tick Sync"}
          </button>
          <button
            type="button"
            disabled={triggerCitrusCankerMutation.isPending || runInProgress}
            onClick={() => triggerCitrusCankerMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerCitrusCankerMutation.isPending || runInProgress ? "Running…" : "Run Citrus Canker Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerAsianCitrusPsyllidMutation.isPending || runInProgress}
            onClick={() => triggerAsianCitrusPsyllidMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerAsianCitrusPsyllidMutation.isPending || runInProgress ? "Running…" : "Run Asian Citrus Psyllid Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerSweetOrangeScabMutation.isPending || runInProgress}
            onClick={() => triggerSweetOrangeScabMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerSweetOrangeScabMutation.isPending || runInProgress ? "Running…" : "Run Sweet Orange Scab Quarantine Sync"}
          </button>
          <button
            type="button"
            disabled={triggerErsCountyTypologyMutation.isPending || runInProgress}
            onClick={() => triggerErsCountyTypologyMutation.mutate()}
            className="whitespace-nowrap rounded border border-border-default px-md py-sm text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {triggerErsCountyTypologyMutation.isPending || runInProgress ? "Running…" : "Run ERS County Typology Sync"}
          </button>
        </div>
      </header>

      {[
        triggerFemaMutation,
        triggerParcelMutation,
        triggerSoilMutation,
        triggerWetlandsMutation,
        triggerCitrusMutation,
        triggerBlackSpotMutation,
        triggerCropCoverMutation,
        triggerAgCensusMutation,
        triggerTimberMutation,
        triggerCropLossMutation,
        triggerCountyEconomicMutation,
        triggerRdEligibilityMutation,
        triggerForestHealthMutation,
        triggerFireAntMutation,
        triggerSpongyMothMutation,
        triggerAsianLonghornedBeetleMutation,
        triggerSuddenOakDeathMutation,
        triggerEmeraldAshBorerMutation,
        triggerHpaiDairyCattleMutation,
        triggerAsianLonghornedTickMutation,
        triggerCitrusCankerMutation,
        triggerAsianCitrusPsyllidMutation,
        triggerSweetOrangeScabMutation,
        triggerErsCountyTypologyMutation,
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
        triggerBlackSpotMutation.isSuccess ||
        triggerCropCoverMutation.isSuccess ||
        triggerAgCensusMutation.isSuccess ||
        triggerTimberMutation.isSuccess ||
        triggerCropLossMutation.isSuccess ||
        triggerCountyEconomicMutation.isSuccess ||
        triggerRdEligibilityMutation.isSuccess ||
        triggerForestHealthMutation.isSuccess ||
        triggerFireAntMutation.isSuccess ||
        triggerSpongyMothMutation.isSuccess ||
        triggerAsianLonghornedBeetleMutation.isSuccess ||
        triggerSuddenOakDeathMutation.isSuccess ||
        triggerEmeraldAshBorerMutation.isSuccess ||
        triggerHpaiDairyCattleMutation.isSuccess ||
        triggerAsianLonghornedTickMutation.isSuccess ||
        triggerCitrusCankerMutation.isSuccess ||
        triggerAsianCitrusPsyllidMutation.isSuccess ||
        triggerSweetOrangeScabMutation.isSuccess ||
        triggerErsCountyTypologyMutation.isSuccess) && (
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
