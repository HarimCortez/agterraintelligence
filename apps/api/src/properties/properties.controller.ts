import { Controller, Get, Query, Param, ParseUUIDPipe } from "@nestjs/common";
import { PropertiesService } from "./properties.service";
import { ListPropertiesQuery } from "./dto/list-properties.query";
import { ListPropertiesResponseDto, PropertyDetailDto } from "./dto/property-result.dto";
import { toListPropertiesResponse, toPropertyDetail } from "./properties.serializers";

/**
 * Properties API — public read-only endpoints for browsing and filtering
 * agricultural properties (no authentication required).
 *
 * Free-tier users can access listing/search via GET /v1/properties with
 * powerful filtering (price, acreage, opportunity score, land use, location
 * bbox, etc.) and sorting options.
 */
@Controller("properties")
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  /**
   * List/search properties with optional filters and sorting.
   *
   * Query parameters (all optional):
   * - minPrice, maxPrice (cents)
   * - minAcreage, maxAcreage
   * - minScore, maxScore (0-100)
   * - band (one or more: exceptional, strong, promising, watch, limited)
   * - landUseType (one or more: row_crop, pasture, timber, citrus, mixed_agricultural, vacant_agricultural)
   * - listingStatus (one or more: active, pending, sold, off_market; defaults to active only)
   * - county (exact match)
   * - bbox (minLng,minLat,maxLng,maxLat for geospatial filtering)
   * - sort (score_desc, score_asc, price_asc, price_desc, discount_desc; default: score_desc)
   * - limit (1-100, default 20)
   * - offset (default 0)
   *
   * Response: { results: [...], total: number, limit: number, offset: number }
   */
  @Get()
  async listProperties(
    @Query() query: ListPropertiesQuery,
  ): Promise<ListPropertiesResponseDto> {
    const rows = await this.propertiesService.listProperties(query);
    return toListPropertiesResponse(rows, query.limit ?? 20, query.offset ?? 0);
  }

  /**
   * Get a single property by ID with full details including risk flags.
   *
   * Path parameters:
   * - id (UUID) - the property ID
   *
   * Response includes full property details, opportunity score (if any),
   * valuation data (if any), and complete array of risk flags.
   *
   * Returns 404 if property not found, 400 if id is not a valid UUID.
   */
  @Get(':id')
  async getProperty(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PropertyDetailDto> {
    const row = await this.propertiesService.getPropertyById(id);
    return toPropertyDetail(row);
  }
}
