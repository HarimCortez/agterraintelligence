import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { AdminBillingService } from "./admin-billing.service";
import { ListAdminSubscriptionsQuery } from "./dto/list-subscriptions.query";
import { ListAdminReportOrdersQuery } from "./dto/list-report-orders.query";
import {
  AdminBillingSummaryDto,
  ListAdminReportOrdersResponseDto,
  ListAdminSubscriptionsResponseDto,
} from "./dto/admin-billing.dto";

/**
 * `/v1/admin/billing/*` — read-only, gated by `billing.read` (table-driven
 * via `role_permissions`, granted to super_admin/admin/billing_manager/
 * readonly_analyst — see `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`).
 * The first real consumer of `PermissionsGuard`/`@RequirePermission` in
 * this codebase — every prior admin route was authentication-only.
 */
@Controller("admin/billing")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@RequirePermission("billing.read")
export class AdminBillingController {
  constructor(private readonly adminBillingService: AdminBillingService) {}

  @Get("summary")
  getSummary(): Promise<AdminBillingSummaryDto> {
    return this.adminBillingService.getSummary();
  }

  @Get("subscriptions")
  listSubscriptions(@Query() query: ListAdminSubscriptionsQuery): Promise<ListAdminSubscriptionsResponseDto> {
    return this.adminBillingService.listSubscriptions(query);
  }

  @Get("report-orders")
  listReportOrders(@Query() query: ListAdminReportOrdersQuery): Promise<ListAdminReportOrdersResponseDto> {
    return this.adminBillingService.listReportOrders(query);
  }
}
