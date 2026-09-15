import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { FemaFloodZoneIngestionService } from "../ingestion/fema-flood-zone-ingestion.service";
import { FlParcelCadastralIngestionService } from "../ingestion/fl-parcel-cadastral-ingestion.service";
import { UsdaSoilIngestionService } from "../ingestion/usda-soil-ingestion.service";
import { WetlandsIngestionService } from "../ingestion/wetlands-ingestion.service";
import { CitrusQuarantineIngestionService } from "../ingestion/citrus-quarantine-ingestion.service";
import { CitrusBlackSpotIngestionService } from "../ingestion/citrus-black-spot-ingestion.service";
import { CroplandCoverIngestionService } from "../ingestion/cropland-cover-ingestion.service";
import { NassAgCensusIngestionService } from "../ingestion/nass-ag-census-ingestion.service";
import { FiaTimberIngestionService } from "../ingestion/fia-timber-ingestion.service";
import { RmaCauseOfLossIngestionService } from "../ingestion/rma-cause-of-loss-ingestion.service";
import { ErsCountyEconomicIngestionService } from "../ingestion/ers-county-economic-ingestion.service";
import { UsdaRdEligibilityIngestionService } from "../ingestion/usda-rd-eligibility-ingestion.service";
import { UsdaForestHealthIngestionService } from "../ingestion/usda-forest-health-ingestion.service";
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
    private readonly citrusQuarantineIngestion: CitrusQuarantineIngestionService,
    private readonly citrusBlackSpotIngestion: CitrusBlackSpotIngestionService,
    private readonly croplandCoverIngestion: CroplandCoverIngestionService,
    private readonly nassAgCensusIngestion: NassAgCensusIngestionService,
    private readonly fiaTimberIngestion: FiaTimberIngestionService,
    private readonly rmaCauseOfLossIngestion: RmaCauseOfLossIngestionService,
    private readonly ersCountyEconomicIngestion: ErsCountyEconomicIngestionService,
    private readonly usdaRdEligibilityIngestion: UsdaRdEligibilityIngestionService,
    private readonly usdaForestHealthIngestion: UsdaForestHealthIngestionService,
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

  async triggerCitrusQuarantineRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.citrusQuarantineIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_aphis_citrus_quarantine" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerCitrusBlackSpotRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.citrusBlackSpotIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_aphis_citrus_black_spot" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerCroplandCoverRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.croplandCoverIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_nass_cropland_data_layer" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerNassAgCensusRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.nassAgCensusIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_nass_ag_census" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerFiaTimberRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.fiaTimberIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_fs_fia_timber" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerRmaCauseOfLossRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.rmaCauseOfLossIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_rma_cause_of_loss" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerErsCountyEconomicRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.ersCountyEconomicIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_ers_county_economic" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerUsdaRdEligibilityRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.usdaRdEligibilityIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_rd_eligibility" },
    });

    return { id, status: "running", itemsProcessed: 0, recordsCreated: 0, errorMessage: null };
  }

  async triggerUsdaForestHealthRun(admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    const { id } = await this.usdaForestHealthIngestion.trigger();

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "ingestion.run",
      targetType: "ingestion_run",
      targetId: id,
      metadata: { source: "usda_forest_health" },
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
