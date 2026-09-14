import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { CurrentAdmin } from "../identity-access/admin/current-admin.decorator";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminIngestionService } from "./admin-ingestion.service";
import { ListIngestionRunsQuery } from "./dto/list-ingestion-runs.query";
import { ListParcelRecordsQuery } from "./dto/list-parcel-records.query";
import {
  ListIngestionRunsResponseDto,
  ListParcelRecordsResponseDto,
  TriggerIngestionResponseDto,
} from "./dto/admin-ingestion.dto";

/**
 * `/v1/admin/ingestion/*`. Reads are gated by `ingestion.read`; triggering
 * a real run requires the narrower `ingestion.run` (super_admin/admin
 * only — it makes real outbound calls to an external service and writes
 * real risk-flag data, not just visibility). See
 * `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`.
 */
@Controller("admin/ingestion")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminIngestionController {
  constructor(private readonly ingestionService: AdminIngestionService) {}

  @Get("runs")
  @RequirePermission("ingestion.read")
  listRuns(@Query() query: ListIngestionRunsQuery): Promise<ListIngestionRunsResponseDto> {
    return this.ingestionService.listRuns(query);
  }

  @Post("fema-flood-zones/run")
  @RequirePermission("ingestion.run")
  triggerFemaFloodZoneRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerFemaFloodZoneRun(admin);
  }

  @Post("fl-parcels/run")
  @RequirePermission("ingestion.run")
  triggerFlParcelRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerFlParcelRun(admin);
  }

  @Post("usda-soil/run")
  @RequirePermission("ingestion.run")
  triggerUsdaSoilRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerUsdaSoilRun(admin);
  }

  @Post("wetlands/run")
  @RequirePermission("ingestion.run")
  triggerWetlandsRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerWetlandsRun(admin);
  }

  @Post("citrus-quarantine/run")
  @RequirePermission("ingestion.run")
  triggerCitrusQuarantineRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerCitrusQuarantineRun(admin);
  }

  @Post("citrus-black-spot/run")
  @RequirePermission("ingestion.run")
  triggerCitrusBlackSpotRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerCitrusBlackSpotRun(admin);
  }

  @Post("cropland-cover/run")
  @RequirePermission("ingestion.run")
  triggerCroplandCoverRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerCroplandCoverRun(admin);
  }

  @Post("nass-ag-census/run")
  @RequirePermission("ingestion.run")
  triggerNassAgCensusRun(@CurrentAdmin() admin: AuthenticatedAdminUser): Promise<TriggerIngestionResponseDto> {
    return this.ingestionService.triggerNassAgCensusRun(admin);
  }

  @Get("parcels")
  @RequirePermission("ingestion.read")
  listParcelRecords(@Query() query: ListParcelRecordsQuery): Promise<ListParcelRecordsResponseDto> {
    return this.ingestionService.listParcelRecords(query);
  }
}
