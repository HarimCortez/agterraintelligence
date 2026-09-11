import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { AdminRevenueService } from "./admin-revenue.service";
import { RevenueTrendQuery } from "./dto/revenue-trend.query";
import { TopTransactionsQuery } from "./dto/top-transactions.query";
import { AdminRevenueSummaryDto, RevenueTrendResponseDto, TopTransactionsResponseDto } from "./dto/admin-revenue.dto";

/** `/v1/admin/revenue/*` — read-only, gated by `revenue.read` (granted to super_admin/admin/billing_manager/readonly_analyst — see `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`). */
@Controller("admin/revenue")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@RequirePermission("revenue.read")
export class AdminRevenueController {
  constructor(private readonly revenueService: AdminRevenueService) {}

  @Get("summary")
  getSummary(): Promise<AdminRevenueSummaryDto> {
    return this.revenueService.getSummary();
  }

  @Get("trend")
  getTrend(@Query() query: RevenueTrendQuery): Promise<RevenueTrendResponseDto> {
    return this.revenueService.getTrend(query);
  }

  @Get("top-transactions")
  getTopTransactions(@Query() query: TopTransactionsQuery): Promise<TopTransactionsResponseDto> {
    return this.revenueService.getTopTransactions(query);
  }
}
