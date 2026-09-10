import { LandUseType, ListingStatus, OpportunityBand, ValuationConfidence, RiskSeverity } from "@agterra/db";

export interface PropertyOpportunitySummary {
  score: number;
  band: OpportunityBand;
}

export interface PropertyValuationSummary {
  estimatedValueCents: number;
  discountPct: number;
  confidence: ValuationConfidence;
}

export interface PropertyRiskFlag {
  id: string;
  riskType: string;
  severity: RiskSeverity;
  description: string;
  createdAt: string;
}

export class PropertyResultDto {
  id!: string;
  address!: string;
  county!: string;
  state!: string;
  acreage!: number;
  askingPriceCents!: number;
  landUseType!: LandUseType;
  listingStatus!: ListingStatus;
  lat!: number;
  lng!: number;
  opportunityScore!: PropertyOpportunitySummary | null;
  valuation!: PropertyValuationSummary | null;
  riskFlagCount!: number;
}

export class PropertyDetailDto {
  id!: string;
  address!: string;
  county!: string;
  state!: string;
  acreage!: number;
  askingPriceCents!: number;
  pricePerAcreCents!: number;
  landUseType!: LandUseType;
  listingStatus!: ListingStatus;
  lat!: number;
  lng!: number;
  opportunityScore!: PropertyOpportunitySummary | null;
  valuation!: PropertyValuationSummary | null;
  riskFlags!: PropertyRiskFlag[];
}

export class ListPropertiesResponseDto {
  results!: PropertyResultDto[];
  total!: number;
  limit!: number;
  offset!: number;
}
