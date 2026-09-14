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

/** Real USDA NRCS SSURGO soil survey data at the property's coordinates — see `PropertySoilData` in schema.prisma. */
export interface PropertySoilSummary {
  mapUnitSymbol: string;
  mapUnitName: string;
  drainageClass: string | null;
  floodFrequency: string | null;
  slopePercent: number | null;
  capabilityClass: string | null;
  hydricPct: number | null;
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
  soilData!: PropertySoilSummary | null;
}

export class ListPropertiesResponseDto {
  results!: PropertyResultDto[];
  total!: number;
  limit!: number;
  offset!: number;
}
