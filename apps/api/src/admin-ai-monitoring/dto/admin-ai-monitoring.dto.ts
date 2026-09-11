import { AiCallStatus } from "@agterra/db";

export interface AiMonitoringSummaryDto {
  totalCalls: number;
  succeededCount: number;
  failedCount: number;
  /** 0-100, null when there have been no calls at all — never a misleading 0/100. */
  successRatePct: number | null;
  /** null when there have been no calls at all — never a misleading 0. */
  averageResponseMs: number | null;
  callsByFeature: Record<string, number>;
  /** Whether ANTHROPIC_API_KEY is configured right now — the real, checkable "model status" signal. */
  modelConfigured: boolean;
}

export interface AiMonitoringTrendDayDto {
  date: string;
  succeeded: number;
  failed: number;
}

export interface AiCallLogRowDto {
  id: string;
  feature: string;
  detail: string;
  model: string;
  status: AiCallStatus;
  durationMs: number;
  outputTokens: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ListAiCallLogsResponseDto {
  results: AiCallLogRowDto[];
  total: number;
  limit: number;
  offset: number;
}
