import { LandUseType, ListingStatus, OpportunityBand, ValuationConfidence } from "@agterra/db";
import { PropertyResultDto, ListPropertiesResponseDto, PropertyDetailDto, PropertyRiskFlag } from "./dto/property-result.dto";

/**
 * Raw result row from the combined query. The query includes:
 * - property fields (id, address, county, state, acreage, askingPriceCents, landUseType, listingStatus)
 * - lat/lng from ST_Y/ST_X of location
 * - opportunity score / band (if present, null otherwise)
 * - valuation data (if present, null otherwise)
 * - risk flag count (aggregated)
 * - total count for pagination
 */
export interface RawPropertyRow {
  id: string;
  address: string;
  county: string;
  state: string;
  acreage: string; // Decimal in DB, stringified by Prisma raw queries
  askingPriceCents: number;
  landUseType: string;
  listingStatus: string;
  lat: number;
  lng: number;
  // Opportunity score fields (null if no row)
  opportunityScoreId: string | null;
  opportunityScore: number | null;
  opportunityBand: string | null;
  // Valuation fields (null if no row)
  valuationId: string | null;
  estimatedValueCents: number | null;
  discountPct: string | null; // Decimal, stringified
  valuationConfidence: string | null;
  // Risk flag count
  riskFlagCount: string; // Count result, stringified by raw query
  // Total count
  totalCount: string; // COUNT(*) result
}

/**
 * Raw result row for a single property with full risk flags.
 * Includes all property fields plus an array of risk flags.
 */
export interface RawPropertyDetailRow {
  id: string;
  address: string;
  county: string;
  state: string;
  acreage: string; // Decimal in DB, stringified by Prisma raw queries
  askingPriceCents: number;
  landUseType: string;
  listingStatus: string;
  lat: number;
  lng: number;
  // Opportunity score fields (null if no row)
  opportunityScoreId: string | null;
  opportunityScore: number | null;
  opportunityBand: string | null;
  // Valuation fields (null if no row)
  valuationId: string | null;
  estimatedValueCents: number | null;
  discountPct: string | null; // Decimal, stringified
  valuationConfidence: string | null;
  // Risk flags
  riskFlags: PropertyRiskFlag[];
}

export function toPropertyResult(row: RawPropertyRow): PropertyResultDto {
  const result = new PropertyResultDto();

  result.id = row.id;
  result.address = row.address;
  result.county = row.county;
  result.state = row.state;
  result.acreage = parseFloat(row.acreage);
  result.askingPriceCents = row.askingPriceCents;
  result.landUseType = row.landUseType as LandUseType;
  result.listingStatus = row.listingStatus as ListingStatus;
  result.lat = row.lat;
  result.lng = row.lng;

  // Opportunity score (null if the property doesn't have one)
  if (row.opportunityScoreId !== null) {
    result.opportunityScore = {
      score: row.opportunityScore!,
      band: row.opportunityBand as OpportunityBand,
    };
  } else {
    result.opportunityScore = null;
  }

  // Valuation (null if the property doesn't have one)
  if (row.valuationId !== null) {
    result.valuation = {
      estimatedValueCents: row.estimatedValueCents!,
      discountPct: parseFloat(row.discountPct!),
      confidence: row.valuationConfidence as ValuationConfidence,
    };
  } else {
    result.valuation = null;
  }

  result.riskFlagCount = parseInt(row.riskFlagCount, 10);

  return result;
}

export function toListPropertiesResponse(
  rows: RawPropertyRow[],
  limit: number,
  offset: number,
): ListPropertiesResponseDto {
  const total = rows.length > 0 ? parseInt(rows[0]!.totalCount, 10) : 0;

  return {
    results: rows.map(toPropertyResult),
    total,
    limit,
    offset,
  };
}

export function toPropertyDetail(row: RawPropertyDetailRow): PropertyDetailDto {
  const result = new PropertyDetailDto();

  result.id = row.id;
  result.address = row.address;
  result.county = row.county;
  result.state = row.state;
  result.acreage = parseFloat(row.acreage);
  result.askingPriceCents = row.askingPriceCents;

  // Compute pricePerAcreCents: round to nearest cent
  const acreageNum = parseFloat(row.acreage);
  result.pricePerAcreCents =
    acreageNum > 0
      ? Math.round(row.askingPriceCents / acreageNum)
      : 0;

  result.landUseType = row.landUseType as LandUseType;
  result.listingStatus = row.listingStatus as ListingStatus;
  result.lat = row.lat;
  result.lng = row.lng;

  // Opportunity score (null if the property doesn't have one)
  if (row.opportunityScoreId !== null) {
    result.opportunityScore = {
      score: row.opportunityScore!,
      band: row.opportunityBand as OpportunityBand,
    };
  } else {
    result.opportunityScore = null;
  }

  // Valuation (null if the property doesn't have one)
  if (row.valuationId !== null) {
    result.valuation = {
      estimatedValueCents: row.estimatedValueCents!,
      discountPct: parseFloat(row.discountPct!),
      confidence: row.valuationConfidence as ValuationConfidence,
    };
  } else {
    result.valuation = null;
  }

  // Risk flags
  result.riskFlags = row.riskFlags || [];

  return result;
}
