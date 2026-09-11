import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { FemaFloodZoneIngestionService } from "../ingestion/fema-flood-zone-ingestion.service";
import { ListIngestionRunsQuery } from "./dto/list-ingestion-runs.query";
import { ListIngestionRunsResponseDto, TriggerIngestionResponseDto } from "./dto/admin-ingestion.dto";

@Injectable()
export class AdminIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly femaIngestion: FemaFloodZoneIngestionService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listRuns(query: ListIngestionRunsQuery): Promise<ListIngestionRunsResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.ingestionRun.count(),
    ]);

    return { results: rows, total, limit, offset };
  }

  async triggerFemaFloodZoneRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.femaIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "fema_flood_zones" },
    });

    return { id, status: "running", propertiesChecked: 0, flagsCreated: 0, errorMessage: null };
  }
}
