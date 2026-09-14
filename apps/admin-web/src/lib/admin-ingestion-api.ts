/**
 * `/v1/admin/ingestion/*` client — types verified against
 * `apps/api/src/admin-ingestion/dto/admin-ingestion.dto.ts`, not guessed
 * at. Requires `ingestion.read` server-side for reads, `ingestion.run` for
 * triggering a real run.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export type IngestionRunStatus = "running" | "succeeded" | "failed";

export interface IngestionRunRow {
  id: string;
  source: string;
  status: IngestionRunStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  recordsCreated: number;
  errorMessage: string | null;
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListIngestionRunsParams {
  limit?: number;
  offset?: number;
}

export const adminIngestionRunsQueryKey = (params: ListIngestionRunsParams) =>
  ["admin-ingestion", "runs", params] as const;

async function handleErrorResponse(res: Response, fallbackMessage: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallbackMessage} (HTTP ${res.status})`);
}

export async function fetchAdminIngestionRuns(params: ListIngestionRunsParams): Promise<Paginated<IngestionRunRow>> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/ingestion/runs?${search.toString()}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load ingestion runs");
  return (await res.json()) as Paginated<IngestionRunRow>;
}

export async function triggerFemaFloodZoneRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/fema-flood-zones/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the FEMA flood zone sync");
  return (await res.json()) as IngestionRunRow;
}

export async function triggerFlParcelRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/fl-parcels/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the FL parcel cadastral sync");
  return (await res.json()) as IngestionRunRow;
}

export async function triggerUsdaSoilRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/usda-soil/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the USDA soil data sync");
  return (await res.json()) as IngestionRunRow;
}

export async function triggerWetlandsRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/wetlands/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the wetlands sync");
  return (await res.json()) as IngestionRunRow;
}

export async function triggerCitrusQuarantineRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/citrus-quarantine/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the citrus quarantine sync");
  return (await res.json()) as IngestionRunRow;
}

export async function triggerCroplandCoverRun(): Promise<IngestionRunRow> {
  const res = await adminAuthFetch("/api/v1/admin/ingestion/cropland-cover/run", { method: "POST" });
  if (!res.ok) return handleErrorResponse(res, "Failed to trigger the cropland cover sync");
  return (await res.json()) as IngestionRunRow;
}

export interface ParcelRecordRow {
  id: string;
  county: string;
  parcelId: string;
  ownerName: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  dorUseCode: string;
  dorUseDescription: string;
  acreage: string;
  justValueCents: number;
  ingestedAt: string;
}

export interface ListParcelRecordsParams {
  limit?: number;
  offset?: number;
  county?: string;
}

export const adminParcelRecordsQueryKey = (params: ListParcelRecordsParams) =>
  ["admin-ingestion", "parcels", params] as const;

export async function fetchAdminParcelRecords(
  params: ListParcelRecordsParams,
): Promise<Paginated<ParcelRecordRow>> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  search.set("offset", String(params.offset ?? 0));
  if (params.county) search.set("county", params.county);

  const res = await adminAuthFetch(`/api/v1/admin/ingestion/parcels?${search.toString()}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load parcel records");
  return (await res.json()) as Paginated<ParcelRecordRow>;
}
