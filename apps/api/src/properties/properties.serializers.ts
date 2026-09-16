import { LandUseType, ListingStatus, OpportunityBand, ValuationConfidence } from "@agterra/db";
import { PropertyResultDto, ListPropertiesResponseDto, PropertyDetailDto, PropertyRiskFlag, PropertySoilSummary, PropertyCropCoverSummary, PropertyAgCensusSummaryDto, PropertyTimberSummaryDto, PropertyCropLossSummaryDto, PropertyCountyEconomicSummaryDto } from "./dto/property-result.dto";

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
  // Soil data (null if no PropertySoilData row exists for this property yet)
  soilMapUnitSymbol: string | null;
  soilMapUnitName: string | null;
  soilDrainageClass: string | null;
  soilFloodFrequency: string | null;
  soilSlopePercent: string | null; // Decimal, stringified
  soilCapabilityClass: string | null;
  soilHydricPct: number | null;
  soilFarmlandClassification: string | null;
  // Crop cover (null if no PropertyCropCover row exists for this property yet)
  cropCoverYear: number | null;
  cropCoverCropCode: number | null;
  cropCoverDescription: string | null;
  // Ag census summary (null if no PropertyAgCensusSummary row exists for this property yet).
  // `agCensusYear` is the presence signal (always set when the row exists) — the two figures
  // themselves are independently nullable (NASS can withhold either one for disclosure reasons).
  agCensusYear: number | null;
  agCensusCountyCattleInventoryHead: number | null;
  agCensusCountyAgLandValueCentsPerAcre: number | null;
  agCensusCountyIrrigatedAcres: number | null;
  // Timber summary (null if no PropertyTimberSummary row exists for this property yet).
  // `timberYear` is the presence signal (always set when the row exists).
  timberYear: number | null;
  timberCountyTimberlandAcres: number | null;
  timberCountyVolumeCuFtPerAcre: number | null;
  timberCountyVolumeSamplingErrorPct: string | null; // Decimal, stringified
  // Crop loss summary (null if no PropertyCropLossSummary row exists for this property yet).
  // `cropLossYear` is the presence signal (always set when the row exists).
  cropLossYear: number | null;
  cropLossCountyTopCauseOfLoss: string | null;
  // BIGINT columns — Prisma's raw queries return these as native JS `bigint`, not `number` (confirmed necessary live: a real county-year indemnity total in cents can exceed Postgres INT4's ~2.1 billion range, e.g. DeSoto's real 2024 total was 2,433,085,900 cents).
  cropLossCountyTopCauseOfLossIndemnityCents: bigint | null;
  cropLossCountyTotalIndemnityCents: bigint | null;
  // County economic summary (null if no PropertyCountyEconomicSummary row exists for this property yet).
  // `economicPopulationYear` is the presence signal (always set when the row exists) — `unemploymentYear`/
  // `incomeYear` are separate fields (not derived from the population year) because ERS's own source file
  // publishes unemployment and income figures a year apart from each other.
  economicPopulationYear: number | null;
  economicCountyPopulation: number | null;
  economicCountyNetMigration: number | null;
  economicCountyRuralUrbanContinuumCode: number | null;
  economicUnemploymentYear: number | null;
  economicCountyUnemploymentRatePct: string | null; // Decimal, stringified
  economicIncomeYear: number | null;
  economicCountyMedianHouseholdIncomeCents: number | null;
  // ERS's 2015 County Typology Codes + Natural Amenities Scale — no vintage year (see
  // `PropertyCountyEconomicSummary`'s schema doc comment), and independent of whether the population/
  // unemployment/income fields above are populated (a different ingestion job writes these).
  economicCountyFarmingDependent: boolean | null;
  economicCountyHighNaturalAmenities: boolean | null;
  economicCountyRetirementDestination: boolean | null;
  economicCountyPopulationLoss: boolean | null;
  economicCountyLowEducation: boolean | null;
  economicCountyLowEmployment: boolean | null;
  // ERS ACS 5-year poverty/income estimates — a different vintage/source from `economicCountyMedianHouseholdIncomeCents` above.
  economicPovertyIncomeYear: number | null;
  economicCountyPovertyRatePct: string | null; // Decimal, stringified
  economicCountyChildPovertyRatePct: string | null; // Decimal, stringified
  economicCountyDeepPovertyRatePct: string | null; // Decimal, stringified
  economicCountyPerCapitaIncomeCents: number | null;
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

  // Soil data (null if no PropertySoilData row exists for this property yet)
  if (row.soilMapUnitSymbol !== null) {
    result.soilData = {
      mapUnitSymbol: row.soilMapUnitSymbol,
      mapUnitName: row.soilMapUnitName!,
      drainageClass: row.soilDrainageClass,
      floodFrequency: row.soilFloodFrequency,
      slopePercent: row.soilSlopePercent !== null ? parseFloat(row.soilSlopePercent) : null,
      capabilityClass: row.soilCapabilityClass,
      hydricPct: row.soilHydricPct,
      farmlandClassification: row.soilFarmlandClassification,
    } satisfies PropertySoilSummary;
  } else {
    result.soilData = null;
  }

  // Crop cover (null if no PropertyCropCover row exists for this property yet)
  if (row.cropCoverYear !== null) {
    result.cropCover = {
      year: row.cropCoverYear,
      cropCode: row.cropCoverCropCode!,
      cropDescription: row.cropCoverDescription!,
    } satisfies PropertyCropCoverSummary;
  } else {
    result.cropCover = null;
  }

  // Ag census summary (null if no PropertyAgCensusSummary row exists for this property yet)
  if (row.agCensusYear !== null) {
    result.agCensusSummary = {
      year: row.agCensusYear,
      countyCattleInventoryHead: row.agCensusCountyCattleInventoryHead,
      countyAgLandValueCentsPerAcre: row.agCensusCountyAgLandValueCentsPerAcre,
      countyIrrigatedAcres: row.agCensusCountyIrrigatedAcres,
    } satisfies PropertyAgCensusSummaryDto;
  } else {
    result.agCensusSummary = null;
  }

  // Timber summary (null if no PropertyTimberSummary row exists for this property yet)
  if (row.timberYear !== null) {
    result.timberSummary = {
      year: row.timberYear,
      countyTimberlandAcres: row.timberCountyTimberlandAcres,
      countyTimberVolumeCuFtPerAcre: row.timberCountyVolumeCuFtPerAcre,
      countyTimberVolumeSamplingErrorPct:
        row.timberCountyVolumeSamplingErrorPct !== null ? parseFloat(row.timberCountyVolumeSamplingErrorPct) : null,
    } satisfies PropertyTimberSummaryDto;
  } else {
    result.timberSummary = null;
  }

  // Crop loss summary (null if no PropertyCropLossSummary row exists for this property yet)
  if (row.cropLossYear !== null) {
    result.cropLossSummary = {
      year: row.cropLossYear,
      countyTopCauseOfLoss: row.cropLossCountyTopCauseOfLoss,
      // Convert from bigint (real cents totals can exceed INT4, safely fit in JS's Number range) —
      // a raw bigint can't be JSON-serialized as-is.
      countyTopCauseOfLossIndemnityCents:
        row.cropLossCountyTopCauseOfLossIndemnityCents !== null ? Number(row.cropLossCountyTopCauseOfLossIndemnityCents) : null,
      countyTotalIndemnityCents:
        row.cropLossCountyTotalIndemnityCents !== null ? Number(row.cropLossCountyTotalIndemnityCents) : null,
    } satisfies PropertyCropLossSummaryDto;
  } else {
    result.cropLossSummary = null;
  }

  // County economic summary (null if no PropertyCountyEconomicSummary row exists for this property yet)
  if (row.economicPopulationYear !== null) {
    result.countyEconomicSummary = {
      populationYear: row.economicPopulationYear,
      countyPopulation: row.economicCountyPopulation,
      countyNetMigration: row.economicCountyNetMigration,
      countyRuralUrbanContinuumCode: row.economicCountyRuralUrbanContinuumCode,
      unemploymentYear: row.economicUnemploymentYear!,
      countyUnemploymentRatePct:
        row.economicCountyUnemploymentRatePct !== null ? parseFloat(row.economicCountyUnemploymentRatePct) : null,
      incomeYear: row.economicIncomeYear!,
      countyMedianHouseholdIncomeCents: row.economicCountyMedianHouseholdIncomeCents,
      countyFarmingDependent: row.economicCountyFarmingDependent,
      countyHighNaturalAmenities: row.economicCountyHighNaturalAmenities,
      countyRetirementDestination: row.economicCountyRetirementDestination,
      countyPopulationLoss: row.economicCountyPopulationLoss,
      countyLowEducation: row.economicCountyLowEducation,
      countyLowEmployment: row.economicCountyLowEmployment,
      povertyIncomeYear: row.economicPovertyIncomeYear,
      countyPovertyRatePct: row.economicCountyPovertyRatePct !== null ? parseFloat(row.economicCountyPovertyRatePct) : null,
      countyChildPovertyRatePct:
        row.economicCountyChildPovertyRatePct !== null ? parseFloat(row.economicCountyChildPovertyRatePct) : null,
      countyDeepPovertyRatePct:
        row.economicCountyDeepPovertyRatePct !== null ? parseFloat(row.economicCountyDeepPovertyRatePct) : null,
      countyPerCapitaIncomeCents: row.economicCountyPerCapitaIncomeCents,
    } satisfies PropertyCountyEconomicSummaryDto;
  } else {
    result.countyEconomicSummary = null;
  }

  return result;
}
