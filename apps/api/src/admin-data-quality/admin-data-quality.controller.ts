import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { CurrentAdmin } from "../identity-access/admin/current-admin.decorator";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminDataQualityService } from "./admin-data-quality.service";
import { ListDataQualityPropertiesQuery } from "./dto/list-data-quality-properties.query";
import {
  DataQualityPropertyDetailDto,
  DataQualitySummaryDto,
  ListDataQualityPropertiesResponseDto,
  VerifyPropertyResponseDto,
} from "./dto/admin-data-quality.dto";

/**
 * `/v1/admin/data-quality/*`. Reads gated by `data_quality.read`;
 * `verify` (a real mutation of investor-facing valuation confidence)
 * gated by the narrower `data_quality.verify`.
 */
@Controller("admin/data-quality")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminDataQualityController {
  constructor(private readonly dataQualityService: AdminDataQualityService) {}

  @Get("summary")
  @RequirePermission("data_quality.read")
  getSummary(): Promise<DataQualitySummaryDto> {
    return this.dataQualityService.getSummary();
  }

  @Get("properties")
  @RequirePermission("data_quality.read")
  listProperties(@Query() query: ListDataQualityPropertiesQuery): Promise<ListDataQualityPropertiesResponseDto> {
    return this.dataQualityService.listProperties(query);
  }

  @Get("properties/:id")
  @RequirePermission("data_quality.read")
  getProperty(@Param("id", new ParseUUIDPipe()) id: string): Promise<DataQualityPropertyDetailDto> {
    return this.dataQualityService.getPropertyDetail(id);
  }

  @Post("properties/:id/verify")
  @RequirePermission("data_quality.verify")
  verifyProperty(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdminUser,
  ): Promise<VerifyPropertyResponseDto> {
    return this.dataQualityService.verifyProperty(id, admin);
  }
}
