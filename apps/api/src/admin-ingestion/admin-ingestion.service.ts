import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { FemaFloodZoneIngestionService } from "../ingestion/fema-flood-zone-ingestion.service";
import { FlParcelCadastralIngestionService } from "../ingestion/fl-parcel-cadastral-ingestion.service";
import { UsdaSoilIngestionService } from "../ingestion/usda-soil-ingestion.service";
import { WetlandsIngestionService } from "../ingestion/wetlands-ingestion.service";
import { ListIngestionRunsQuery } from "./dto/list-ingestion-runs.query";
import { ListParcelRecordsQuery } from "./dto/list-parcel-records.query";
import {
  ListIngestionRunsResponseDto,
  ListParcelRecordsResponseDto,
  TriggerIngestionResponseDto,
} from "./dto/admin-ingestion.dto";

@Injectable()
export class AdminIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly femaIngestion: FemaFloodZoneIngestionService,
    private readonly flParcelIngestion: FlParcelCadastralIngestionService,
    private readonly usdaSoilIngestion: UsdaSoilIngestionService,
    private readonly wetlandsIngestion: WetlandsIngestionService,
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

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerFlParcelRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.flParcelIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "fl_dor_cadastral" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerUsdaSoilRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.usdaSoilIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_soil_data" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerWetlandsRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.wetlandsIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usfws_wetlands" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async listParcelRecords(query: ListParcelRecordsQuery): Promise<ListParcelRecordsResponseDto> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const where = query.county ? { county: query.county } : {};

    const [rows, total] = await Promise.all([
      this.prisma.parcelRecord.findMany({
        where,
        orderBy: { ingestedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.parcelRecord.count({ where }),
    ]);

    return {
      results: rows.map((row) => ({ ...row, acreage: row.acreage.toString() })),
      total,
      limit,
      offset,
    };
  }
}
