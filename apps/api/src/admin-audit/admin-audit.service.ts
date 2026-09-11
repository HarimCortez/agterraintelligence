import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { ListAuditLogQuery } from "./dto/list-audit-log.query";
import { ListAuditLogResponseDto } from "./dto/admin-audit.dto";

/**
 * Read side of the audit log (REQUIREMENTS.md's audit-logs requirement,
 * Section 10.2). See `packages/db/prisma/schema.prisma`'s `AuditLogEntry`
 * doc comment for what actually writes entries today (admin login
 * attempts, fulfillment retries) — this service only reads what exists,
 * it doesn't write anything itself.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listEntries(query: ListAuditLogQuery): Promise<ListAuditLogResponseDto> {
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorEmail ? { actorEmail: { contains: query.actorEmail, mode: "insensitive" as const } } : {}),
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLogEntry.count({ where }),
    ]);

    return {
      results: rows.map((row) => ({
        id: row.id,
        actorEmail: row.actorEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }
}
