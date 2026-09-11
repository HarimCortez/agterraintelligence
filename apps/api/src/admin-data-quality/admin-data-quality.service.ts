import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ValuationConfidence } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { ListDataQualityPropertiesQuery } from "./dto/list-data-quality-properties.query";
import {
  DataQualityIssue,
  DataQualityPropertyDetailDto,
  DataQualityPropertyRowDto,
  DataQualitySummaryDto,
  ListDataQualityPropertiesResponseDto,
  VerifyPropertyResponseDto,
} from "./dto/admin-data-quality.dto";

interface ListRow {
  id: string;
  address: string;
  county: string;
  confidence: ValuationConfidence | null;
  riskFlagCount: bigint;
  missingValuation: boolean;
  missingScore: boolean;
  possibleDuplicate: boolean;
  updatedAt: Date;
  totalCount: bigint;
}

/**
 * Content & Data Quality admin operations (REQUIREMENTS.md Section 6/10.2):
 * a review table over real property data with three computed signals —
 * missing valuation, missing opportunity score (both nullable-by-absence
 * per `properties.serializers.ts`'s existing pattern, not new data), and
 * "possible duplicate" (two properties sharing the same address text,
 * case-insensitive — real, computed from `parcelId`'s existing unique-
 * constraint gap: two distinct parcels can still share a display address).
 * `confidence` (verified/modeled/ai_inferred/unknown) is `data`'s existing
 * `ValuationConfidence` field, not new either.
 *
 * The one real mutation here is `verifyProperty`: marks a valuation
 * `verified` after manual review, audited via `AuditLogService`.
 * Deliberately NOT here — editing the actual valuation numbers
 * (estimated value, discount) — that's a materially riskier action
 * (silently misrepresenting real financial data investors see) that
 * needs its own reviewed design, same reasoning
 * `admin-report-fulfillment.service.ts` and `admin-billing.service.ts`
 * both give for deferring refund tooling. A parcel map is also not here:
 * admin-web has no Mapbox integration today, and the real one already
 * exists on investor-web's Property Intelligence Page — the detail
 * response includes `lat`/`lng` so the frontend can link out to it
 * rather than duplicating map infrastructure for an internal tool.
 */
@Injectable()
export class AdminDataQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getSummary(): Promise<DataQualitySummaryDto> {
    const [confidenceRows, missingValuation, missingScore, duplicateRows, flaggedRows] = await Promise.all([
      this.prisma.propertyValuation.groupBy({ by: ["confidence"], _count: { _all: true } }),
      this.prisma.property.count({ where: { valuation: null } }),
      this.prisma.property.count({ where: { opportunityScore: null } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM properties p
        WHERE EXISTS (
          SELECT 1 FROM properties p2
          WHERE p2.id <> p.id AND LOWER(p2.address) = LOWER(p.address)
        )
      `,
      this.prisma.propertyRiskFlag.findMany({ select: { propertyId: true }, distinct: ["propertyId"] }),
    ]);

    const countByConfidence = {
      verified: 0,
      modeled: 0,
      ai_inferred: 0,
      unknown: 0,
    } as Record<ValuationConfidence, number>;
    for (const row of confidenceRows) {
      countByConfidence[row.confidence] = row._count._all;
    }

    return {
      countByConfidence,
      propertiesMissingValuation: missingValuation,
      propertiesMissingScore: missingScore,
      possibleDuplicateProperties: Number(duplicateRows[0]?.count ?? 0),
      flaggedPropertiesCount: flaggedRows.length,
    };
  }

  async listProperties(query: ListDataQualityPropertiesQuery): Promise<ListDataQualityPropertiesResponseDto> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (query.confidence) {
      conditions.push(`pv.confidence = $${i}::valuation_confidence`);
      params.push(query.confidence);
      i++;
    }
    if (query.issue === "missing_valuation") conditions.push("pv.id IS NULL");
    if (query.issue === "missing_score") conditions.push("os.id IS NULL");
    if (query.issue === "possible_duplicate") conditions.push("dup.addr_key IS NOT NULL");
    if (query.issue === "has_risk_flags") conditions.push("COALESCE(risk_counts.count, 0) > 0");

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitParam = i;
    const offsetParam = i + 1;
    params.push(limit, offset);

    const sql = `
      WITH dup AS (
        SELECT LOWER(address) AS addr_key FROM properties GROUP BY LOWER(address) HAVING COUNT(*) > 1
      )
      SELECT
        p.id, p.address, p.county,
        pv.confidence AS "confidence",
        COALESCE(risk_counts.count, 0) AS "riskFlagCount",
        (pv.id IS NULL) AS "missingValuation",
        (os.id IS NULL) AS "missingScore",
        (dup.addr_key IS NOT NULL) AS "possibleDuplicate",
        p.updated_at AS "updatedAt",
        COUNT(*) OVER () AS "totalCount"
      FROM properties p
      LEFT JOIN opportunity_scores os ON p.id = os.property_id
      LEFT JOIN property_valuations pv ON p.id = pv.property_id
      LEFT JOIN dup ON dup.addr_key = LOWER(p.address)
      LEFT JOIN (
        SELECT property_id, COUNT(*) AS count FROM property_risk_flags GROUP BY property_id
      ) risk_counts ON p.id = risk_counts.property_id
      ${whereClause}
      ORDER BY p.updated_at DESC, p.id ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await (this.prisma as any).$queryRawUnsafe(sql, ...params)) as (ListRow & { riskFlagCount: bigint })[];

    return {
      results: rows.map(toRowDto),
      total: rows.length > 0 ? Number(rows[0]!.totalCount) : 0,
      limit,
      offset,
    };
  }

  async getPropertyDetail(id: string): Promise<DataQualityPropertyDetailDto> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        opportunityScore: true,
        valuation: true,
        riskFlags: { orderBy: { createdAt: "desc" } },
        aiInteractions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!property) {
      throw new NotFoundException(`Property with id ${id} not found`);
    }

    const [locationRows, duplicates] = await Promise.all([
      this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
        SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM properties WHERE id = ${id}::uuid
      `,
      this.prisma.property.findMany({
        where: { id: { not: id }, address: { equals: property.address, mode: "insensitive" } },
        select: { id: true, address: true, county: true },
      }),
    ]);
    const location = locationRows[0] ?? { lat: 0, lng: 0 };

    const issues: DataQualityIssue[] = [];
    if (!property.valuation) issues.push("missing_valuation");
    if (!property.opportunityScore) issues.push("missing_score");
    if (duplicates.length > 0) issues.push("possible_duplicate");
    if (property.riskFlags.length > 0) issues.push("has_risk_flags");

    return {
      id: property.id,
      address: property.address,
      county: property.county,
      confidence: property.valuation?.confidence ?? null,
      riskFlagCount: property.riskFlags.length,
      issues,
      updatedAt: property.updatedAt,
      acreage: property.acreage.toString(),
      askingPriceCents: property.askingPriceCents,
      landUseType: property.landUseType,
      lat: location.lat,
      lng: location.lng,
      opportunityScore: property.opportunityScore?.score ?? null,
      opportunityBand: property.opportunityScore?.band ?? null,
      estimatedValueCents: property.valuation?.estimatedValueCents ?? null,
      discountPct: property.valuation?.discountPct.toString() ?? null,
      riskFlags: property.riskFlags.map((f) => ({
        id: f.id,
        riskType: f.riskType,
        severity: f.severity,
        description: f.description,
        createdAt: f.createdAt,
      })),
      aiInteractions: property.aiInteractions.map((a) => ({
        id: a.id,
        contextType: a.contextType,
        question: a.question,
        modelVersion: a.modelVersion,
        createdAt: a.createdAt,
      })),
      duplicateCandidates: duplicates,
    };
  }

  /**
   * Marks a property's valuation as manually verified after review.
   * Requires a valuation to already exist — verifying something that was
   * never modeled in the first place isn't a real state.
   */
  async verifyProperty(id: string, admin: AuthenticatedAdminUser): Promise<VerifyPropertyResponseDto> {
    const valuation = await this.prisma.propertyValuation.findUnique({
      where: { propertyId: id },
      select: { confidence: true },
    });
    if (!valuation) {
      throw new BadRequestException("This property has no valuation to verify");
    }
    if (valuation.confidence === "verified") {
      throw new ConflictException("This property is already verified");
    }

    await this.prisma.propertyValuation.update({ where: { propertyId: id }, data: { confidence: "verified" } });

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "data_quality.verify",
      targetType: "property",
      targetId: id,
      metadata: { previousConfidence: valuation.confidence },
    });

    return { id, confidence: "verified" };
  }
}

function toRowDto(row: ListRow): DataQualityPropertyRowDto {
  const issues: DataQualityIssue[] = [];
  if (row.missingValuation) issues.push("missing_valuation");
  if (row.missingScore) issues.push("missing_score");
  if (row.possibleDuplicate) issues.push("possible_duplicate");
  if (Number(row.riskFlagCount) > 0) issues.push("has_risk_flags");

  return {
    id: row.id,
    address: row.address,
    county: row.county,
    confidence: row.confidence,
    riskFlagCount: Number(row.riskFlagCount),
    issues,
    updatedAt: row.updatedAt,
  };
}
