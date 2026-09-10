import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ListPropertiesQuery } from "./dto/list-properties.query";
import { RawPropertyRow, RawPropertyDetailRow } from "./properties.serializers";
import { ListingStatus, OpportunityBand, LandUseType } from "@agterra/db";

/**
 * Service for property listing/search. Uses $queryRaw to handle the
 * geography(Point) column which Prisma Client cannot access directly.
 *
 * Query strategy: single raw SQL query with LEFT JOINs on scores/valuations
 * and a subquery for risk flag counts, avoiding N+1 while keeping
 * parameterization clean and SQL injection-safe.
 */
@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listProperties(query: ListPropertiesQuery): Promise<RawPropertyRow[]> {
    // Normalize defaults
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const sort = query.sort ?? 'score_desc';

    // If listingStatus not specified, default to 'active' only
    let statuses: ListingStatus[] = [];
    if (query.listingStatus === undefined) {
      statuses = [ListingStatus.active];
    } else if (Array.isArray(query.listingStatus)) {
      statuses = query.listingStatus;
    } else {
      statuses = [query.listingStatus];
    }

    // Normalize band array
    let bands: string[] = [];
    if (query.band !== undefined) {
      bands = Array.isArray(query.band) ? query.band : [query.band];
    }

    // Normalize landUseType array
    let landUseTypes: string[] = [];
    if (query.landUseType !== undefined) {
      landUseTypes = Array.isArray(query.landUseType)
        ? query.landUseType
        : [query.landUseType];
    }

    // Build conditions and params array
    const conditions: string[] = [];
    const params: (string | number | string[] | ListingStatus[] | OpportunityBand[] | LandUseType[])[] = [];
    let paramIndex = 1;

    // Price range filters
    if (query.minPrice !== undefined) {
      conditions.push(`p.asking_price_cents >= $${paramIndex}`);
      params.push(query.minPrice);
      paramIndex++;
    }
    if (query.maxPrice !== undefined) {
      conditions.push(`p.asking_price_cents <= $${paramIndex}`);
      params.push(query.maxPrice);
      paramIndex++;
    }

    // Acreage filters
    if (query.minAcreage !== undefined) {
      conditions.push(`p.acreage >= $${paramIndex}`);
      params.push(query.minAcreage);
      paramIndex++;
    }
    if (query.maxAcreage !== undefined) {
      conditions.push(`p.acreage <= $${paramIndex}`);
      params.push(query.maxAcreage);
      paramIndex++;
    }

    // Listing status filter (default to active if not specified)
    conditions.push(`p.listing_status = ANY($${paramIndex}::listing_status[])`);
    params.push(statuses);
    paramIndex++;

    // County filter
    if (query.county !== undefined) {
      conditions.push(`p.county = $${paramIndex}`);
      params.push(query.county);
      paramIndex++;
    }

    // Score filters (only apply if opportunity score exists)
    if (query.minScore !== undefined) {
      conditions.push(`os.score >= $${paramIndex}`);
      params.push(query.minScore);
      paramIndex++;
    }
    if (query.maxScore !== undefined) {
      conditions.push(`os.score <= $${paramIndex}`);
      params.push(query.maxScore);
      paramIndex++;
    }

    // Band filters
    if (bands.length > 0) {
      conditions.push(`os.band = ANY($${paramIndex}::opportunity_band[])`);
      params.push(bands);
      paramIndex++;
    }

    // Land use type filters
    if (landUseTypes.length > 0) {
      conditions.push(`p.land_use_type = ANY($${paramIndex}::land_use_type[])`);
      params.push(landUseTypes);
      paramIndex++;
    }

    // Bounding box filter
    if (query.bbox) {
      const parts = query.bbox.split(",").map(p => parseFloat(p.trim()));
      if (parts.length === 4 && parts.every(p => !isNaN(p))) {
        const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
        conditions.push(
          `p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)::geography`
        );
        params.push(minLng, minLat, maxLng, maxLat);
        paramIndex += 4;
      } else {
        throw new BadRequestException("Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat");
      }
    }

    // Build WHERE clause
    const whereClause =
      conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // Sort clause
    let orderByClause = "";
    switch (sort) {
      case "score_asc":
        orderByClause = " ORDER BY os.score ASC NULLS LAST, p.id ASC";
        break;
      case "price_asc":
        orderByClause = " ORDER BY p.asking_price_cents ASC, p.id ASC";
        break;
      case "price_desc":
        orderByClause = " ORDER BY p.asking_price_cents DESC, p.id ASC";
        break;
      case "discount_desc":
        orderByClause = " ORDER BY pv.discount_pct DESC NULLS LAST, p.id ASC";
        break;
      case "score_desc":
      default:
        orderByClause = " ORDER BY os.score DESC NULLS LAST, p.id ASC";
        break;
    }

    // Add limit and offset parameters
    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    params.push(limit, offset);

    // Build the complete query
    const sql = `
      SELECT
        p.id,
        p.address,
        p.county,
        p.state,
        p.acreage,
        p.asking_price_cents AS "askingPriceCents",
        p.land_use_type AS "landUseType",
        p.listing_status AS "listingStatus",
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng,
        os.id AS "opportunityScoreId",
        os.score AS "opportunityScore",
        os.band AS "opportunityBand",
        pv.id AS "valuationId",
        pv.estimated_value_cents AS "estimatedValueCents",
        pv.discount_pct AS "discountPct",
        pv.confidence AS "valuationConfidence",
        COALESCE(risk_counts.count, 0) AS "riskFlagCount",
        COUNT(*) OVER () AS "totalCount"
      FROM properties p
      LEFT JOIN opportunity_scores os ON p.id = os.property_id
      LEFT JOIN property_valuations pv ON p.id = pv.property_id
      LEFT JOIN (
        SELECT property_id, COUNT(*) as count
        FROM property_risk_flags
        GROUP BY property_id
      ) risk_counts ON p.id = risk_counts.property_id
      ${whereClause}${orderByClause}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    // Execute using $queryRawUnsafe with proper parameter binding
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.prisma as any).$queryRawUnsafe(sql, ...params) as RawPropertyRow[];

    return result;
  }

  async getPropertyById(id: string): Promise<RawPropertyDetailRow> {
    // Query property with opportunity score, valuation, and full risk flags
    const sql = `
      SELECT
        p.id,
        p.address,
        p.county,
        p.state,
        p.acreage,
        p.asking_price_cents AS "askingPriceCents",
        p.land_use_type AS "landUseType",
        p.listing_status AS "listingStatus",
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng,
        os.id AS "opportunityScoreId",
        os.score AS "opportunityScore",
        os.band AS "opportunityBand",
        pv.id AS "valuationId",
        pv.estimated_value_cents AS "estimatedValueCents",
        pv.discount_pct AS "discountPct",
        pv.confidence AS "valuationConfidence",
        COALESCE(
          json_agg(
            json_build_object(
              'id', prf.id,
              'riskType', prf.risk_type,
              'severity', prf.severity,
              'description', prf.description,
              'createdAt', prf.created_at
            ) ORDER BY prf.created_at DESC
          ) FILTER (WHERE prf.id IS NOT NULL),
          '[]'::json
        ) AS "riskFlags"
      FROM properties p
      LEFT JOIN opportunity_scores os ON p.id = os.property_id
      LEFT JOIN property_valuations pv ON p.id = pv.property_id
      LEFT JOIN property_risk_flags prf ON p.id = prf.property_id
      WHERE p.id = $1::uuid
      GROUP BY p.id, p.address, p.county, p.state, p.acreage, p.asking_price_cents,
               p.land_use_type, p.listing_status, p.location,
               os.id, os.score, os.band, pv.id, pv.estimated_value_cents,
               pv.discount_pct, pv.confidence
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.prisma as any).$queryRawUnsafe(sql, id) as RawPropertyDetailRow[];

    if (result.length === 0) {
      throw new NotFoundException(`Property with id ${id} not found`);
    }

    // Parse the JSON-aggregated risk flags from the query result
    const row = result[0]!;
    if (typeof row.riskFlags === 'string') {
      row.riskFlags = JSON.parse(row.riskFlags);
    }

    return row;
  }
}
