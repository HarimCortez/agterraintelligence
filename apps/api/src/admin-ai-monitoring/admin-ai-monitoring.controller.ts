import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { AdminAiMonitoringService } from "./admin-ai-monitoring.service";
import { AiMonitoringTrendQuery } from "./dto/ai-monitoring-trend.query";
import { ListAiCallLogsQuery } from "./dto/list-ai-call-logs.query";
import { AiMonitoringSummaryDto, AiMonitoringTrendDayDto, ListAiCallLogsResponseDto } from "./dto/admin-ai-monitoring.dto";

/** `/v1/admin/ai-monitoring/*` — all read-only, gated by `ai_monitoring.read`. */
@Controller("admin/ai-monitoring")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminAiMonitoringController {
  constructor(private readonly aiMonitoringService: AdminAiMonitoringService) {}

  @Get("summary")
  @RequirePermission("ai_monitoring.read")
  getSummary(): Promise<AiMonitoringSummaryDto> {
    return this.aiMonitoringService.getSummary();
  }

  @Get("trend")
  @RequirePermission("ai_monitoring.read")
  getTrend(@Query() query: AiMonitoringTrendQuery): Promise<{ points: AiMonitoringTrendDayDto[] }> {
    return this.aiMonitoringService.getTrend(query);
  }

  @Get("calls")
  @RequirePermission("ai_monitoring.read")
  listCalls(@Query() query: ListAiCallLogsQuery): Promise<ListAiCallLogsResponseDto> {
    return this.aiMonitoringService.listCalls(query);
  }
}
