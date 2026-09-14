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

/** Real USDA NASS Cropland Data Layer satellite classification at the property's coordinates — see `PropertyCropCover` in schema.prisma. */
export interface PropertyCropCoverSummary {
  year: number;
  cropCode: number;
  cropDescription: string;
}

/** Real USDA NASS Census of Agriculture figures for the property's own COUNTY (not parcel-specific) — see `PropertyAgCensusSummary` in schema.prisma. */
export interface PropertyAgCensusSummaryDto {
  year: number;
  countyCattleInventoryHead: number | null;
  countyAgLandValueCentsPerAcre: number | null;
}

/** Real USDA Forest Service FIA figures for the property's own COUNTY (not parcel-specific) — see `PropertyTimberSummary` in schema.prisma. */
export interface PropertyTimberSummaryDto {
  year: number;
  countyTimberlandAcres: number | null;
  countyTimberVolumeCuFtPerAcre: number | null;
  countyTimberVolumeSamplingErrorPct: number | null;
}

/** Real USDA RMA federal crop insurance Cause of Loss figures for the property's own COUNTY (not parcel-specific) — see `PropertyCropLossSummary` in schema.prisma. */
export interface PropertyCropLossSummaryDto {
  year: number;
  countyTopCauseOfLoss: string | null;
  countyTopCauseOfLossIndemnityCents: number | null;
  countyTotalIndemnityCents: number | null;
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
  cropCover!: PropertyCropCoverSummary | null;
  agCensusSummary!: PropertyAgCensusSummaryDto | null;
  timberSummary!: PropertyTimberSummaryDto | null;
  cropLossSummary!: PropertyCropLossSummaryDto | null;
}

export class ListPropertiesResponseDto {
  results!: PropertyResultDto[];
  total!: number;
  limit!: number;
  offset!: number;
}
