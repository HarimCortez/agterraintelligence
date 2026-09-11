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
  propertiesChecked: number;
  flagsCreated: number;
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
