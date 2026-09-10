import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { LandUseType, ListingStatus, OpportunityBand } from "@agterra/db";

/**
 * Query parameters for `GET /v1/properties` — all optional, combined as AND filters.
 *
 * Array params (band, landUseType, listingStatus) are parsed from repeated
 * query params, e.g. `?band=strong&band=exceptional`. The @Type + @IsEnum
 * combo below handles both single values and arrays correctly via
 * class-validator's built-in array handling.
 */
export class ListPropertiesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAcreage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAcreage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxScore?: number;

  /**
   * One or more opportunity bands (exceptional, strong, promising, watch, limited).
   * Accepts single value or array from repeated query params.
   */
  @IsOptional()
  @Type(() => String)
  @IsEnum(OpportunityBand, { each: true })
  band?: OpportunityBand | OpportunityBand[];

  /**
   * One or more land use types.
   * Accepts single value or array from repeated query params.
   */
  @IsOptional()
  @Type(() => String)
  @IsEnum(LandUseType, { each: true })
  landUseType?: LandUseType | LandUseType[];

  /**
   * One or more listing statuses. If not specified, defaults to 'active' only.
   * Accepts single value or array from repeated query params.
   */
  @IsOptional()
  @Type(() => String)
  @IsEnum(ListingStatus, { each: true })
  listingStatus?: ListingStatus | ListingStatus[];

  @IsOptional()
  @IsString()
  county?: string;

  /**
   * Bounding box format: minLng,minLat,maxLng,maxLat
   * e.g., ?bbox=-82.5,25.0,-81.0,26.0
   * Properties whose location falls within the envelope are returned.
   */
  @IsOptional()
  @IsString()
  bbox?: string;

  /**
   * Sort order: score_desc (default), score_asc, price_asc, price_desc, discount_desc
   */
  @IsOptional()
  @IsEnum(['score_desc', 'score_asc', 'price_asc', 'price_desc', 'discount_desc'])
  sort?: 'score_desc' | 'score_asc' | 'price_asc' | 'price_desc' | 'discount_desc' = 'score_desc';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}
