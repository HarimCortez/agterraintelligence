/**
 * `/v1/admin/data-quality/*` client — types verified against
 * `apps/api/src/admin-data-quality/dto/admin-data-quality.dto.ts`, not
 * guessed at. Requires `data_quality.read` for reads, `data_quality.verify`
 * for the verify action.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export type ValuationConfidence = "verified" | "modeled" | "ai_inferred" | "unknown";
export type DataQualityIssue = "missing_valuation" | "missing_score" | "possible_duplicate" | "has_risk_flags";

export interface DataQualitySummary {
  countByConfidence: Record<ValuationConfidence, number>;
  propertiesMissingValuation: number;
  propertiesMissingScore: number;
  possibleDuplicateProperties: number;
  flaggedPropertiesCount: number;
}

export interface DataQualityPropertyRow {
  id: string;
  address: string;
  county: string;
  confidence: ValuationConfidence | null;
  riskFlagCount: number;
  issues: DataQualityIssue[];
  updatedAt: string;
}

export interface DataQualityRiskFlag {
  id: string;
  riskType: string;
  severity: string;
  description: string;
  createdAt: string;
}

export interface DataQualityAiInteraction {
  id: string;
  contextType: string;
  question: string | null;
  modelVersion: string;
  createdAt: string;
}

export interface DataQualityDuplicateCandidate {
  id: string;
  address: string;
  county: string;
}

export interface DataQualityPropertyDetail extends DataQualityPropertyRow {
  acreage: string;
  askingPriceCents: number;
  landUseType: string;
  lat: number;
  lng: number;
  opportunityScore: number | null;
  opportunityBand: string | null;
  estimatedValueCents: number | null;
  discountPct: string | null;
  riskFlags: DataQualityRiskFlag[];
  aiInteractions: DataQualityAiInteraction[];
  duplicateCandidates: DataQualityDuplicateCandidate[];
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListDataQualityPropertiesParams {
  confidence?: ValuationConfidence;
  issue?: DataQualityIssue;
  limit?: number;
  offset?: number;
}

export const dataQualitySummaryQueryKey = ["admin-data-quality", "summary"] as const;
export const dataQualityPropertiesQueryKey = (params: ListDataQualityPropertiesParams) =>
  ["admin-data-quality", "properties", params] as const;
export const dataQualityPropertyQueryKey = (id: string) => ["admin-data-quality", "properties", id] as const;

async function handleErrorResponse(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallback} (HTTP ${res.status})`);
}

export async function fetchDataQualitySummary(): Promise<DataQualitySummary> {
  const res = await adminAuthFetch("/api/v1/admin/data-quality/summary");
  if (!res.ok) return handleErrorResponse(res, "Failed to load data quality summary");
  return (await res.json()) as DataQualitySummary;
}

export async function fetchDataQualityProperties(
  params: ListDataQualityPropertiesParams,
): Promise<Paginated<DataQualityPropertyRow>> {
  const search = new URLSearchParams();
  if (params.confidence) search.set("confidence", params.confidence);
  if (params.issue) search.set("issue", params.issue);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/data-quality/properties?${search.toString()}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load properties");
  return (await res.json()) as Paginated<DataQualityPropertyRow>;
}

export async function fetchDataQualityProperty(id: string): Promise<DataQualityPropertyDetail> {
  const res = await adminAuthFetch(`/api/v1/admin/data-quality/properties/${encodeURIComponent(id)}`);
  if (!res.ok) return handleErrorResponse(res, "Failed to load this property");
  return (await res.json()) as DataQualityPropertyDetail;
}

export async function verifyDataQualityProperty(id: string): Promise<{ id: string; confidence: ValuationConfidence }> {
  const res = await adminAuthFetch(`/api/v1/admin/data-quality/properties/${encodeURIComponent(id)}/verify`, {
    method: "POST",
  });
  if (!res.ok) return handleErrorResponse(res, "Failed to verify this property");
  return (await res.json()) as { id: string; confidence: ValuationConfidence };
}
