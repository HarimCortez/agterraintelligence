/**
 * `/v1/admin/ai-monitoring/*` client — types verified against
 * `apps/api/src/admin-ai-monitoring/dto/admin-ai-monitoring.dto.ts`, not
 * guessed at. Requires `ai_monitoring.read`.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export type AiCallStatus = "succeeded" | "failed";

export interface AiMonitoringSummary {
  totalCalls: number;
  succeededCount: number;
  failedCount: number;
  successRatePct: number | null;
  averageResponseMs: number | null;
  callsByFeature: Record<string, number>;
  modelConfigured: boolean;
}

export interface AiMonitoringTrendDay {
  date: string;
  succeeded: number;
  failed: number;
}

export interface AiCallLogRow {
  id: string;
  feature: string;
  detail: string;
  model: string;
  status: AiCallStatus;
  durationMs: number;
  outputTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListAiCallLogsParams {
  status?: AiCallStatus;
  feature?: string;
  limit?: number;
  offset?: number;
}

export const aiMonitoringSummaryQueryKey = ["admin-ai-monitoring", "summary"] as const;
export const aiMonitoringTrendQueryKey = (days: number) => ["admin-ai-monitoring", "trend", days] as const;
export const aiMonitoringCallsQueryKey = (params: ListAiCallLogsParams) =>
  ["admin-ai-monitoring", "calls", params] as const;

async function handleErrorResponse(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallback} (HTTP ${res.status})`);
}

export async function fetchAiMonitoringSummary(): Promise<AiMonitoringSummary> {
  const res = await adminAuthFetch("/api/v1/admin/ai-monitoring/summary");
  if (!res.ok) return handleErrorResponse(res, "Failed to load AI monitoring summary");
  return (await res.json()) as AiMonitoringSummary;
}

export async function fetchAiMonitoringTrend(days: number): Promise<{ points: AiMonitoringTrendDay[] }> {
  const res = await adminAuthFetch(`/api/v1/admin/ai-monitoring/trend?days=${days}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load AI monitoring trend");
  return (await res.json()) as { points: AiMonitoringTrendDay[] };
}

export async function fetchAiMonitoringCalls(params: ListAiCallLogsParams): Promise<Paginated<AiCallLogRow>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.feature) search.set("feature", params.feature);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/ai-monitoring/calls?${search.toString()}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load AI calls");
  return (await res.json()) as Paginated<AiCallLogRow>;
}
