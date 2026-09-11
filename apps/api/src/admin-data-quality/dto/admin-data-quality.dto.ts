import { RiskSeverity, ValuationConfidence } from "@agterra/db";

/** Computed, not stored — see `admin-data-quality.service.ts` for how each is derived. */
export type DataQualityIssue = "missing_valuation" | "missing_score" | "possible_duplicate" | "has_risk_flags";

export interface DataQualitySummaryDto {
  countByConfidence: Record<ValuationConfidence, number>;
  propertiesMissingValuation: number;
  propertiesMissingScore: number;
  possibleDuplicateProperties: number;
  flaggedPropertiesCount: number;
}

export interface DataQualityPropertyRowDto {
  id: string;
  address: string;
  county: string;
  confidence: ValuationConfidence | null;
  riskFlagCount: number;
  issues: DataQualityIssue[];
  updatedAt: Date;
}

export interface ListDataQualityPropertiesResponseDto {
  results: DataQualityPropertyRowDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface DataQualityRiskFlagDto {
  id: string;
  riskType: string;
  severity: RiskSeverity;
  description: string;
  createdAt: Date;
}

export interface DataQualityAiInteractionDto {
  id: string;
  contextType: string;
  question: string | null;
  modelVersion: string;
  createdAt: Date;
}

export interface DataQualityDuplicateCandidateDto {
  id: string;
  address: string;
  county: string;
}

export interface DataQualityPropertyDetailDto extends DataQualityPropertyRowDto {
  acreage: string;
  askingPriceCents: number;
  landUseType: string;
  lat: number;
  lng: number;
  opportunityScore: number | null;
  opportunityBand: string | null;
  estimatedValueCents: number | null;
  discountPct: string | null;
  riskFlags: DataQualityRiskFlagDto[];
  aiInteractions: DataQualityAiInteractionDto[];
  duplicateCandidates: DataQualityDuplicateCandidateDto[];
}

export interface VerifyPropertyResponseDto {
  id: string;
  confidence: ValuationConfidence;
}
