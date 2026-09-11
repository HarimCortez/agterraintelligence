import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { AdminReportFulfillmentService } from "./admin-report-fulfillment.service";
import { ListAdminFulfillmentOrdersQuery } from "./dto/list-fulfillment-orders.query";
import {
  AdminFulfillmentOrderDetailDto,
  AdminFulfillmentSummaryDto,
  ListAdminFulfillmentOrdersResponseDto,
  RetryFulfillmentResponseDto,
} from "./dto/admin-fulfillment.dto";

/**
 * `/v1/admin/fulfillment/*`. Reads are gated by `fulfillment.read`; the
 * retry action requires the separate, narrower `fulfillment.retry`
 * (granted to super_admin/admin/report_fulfillment_manager only, not
 * readonly_analyst — see `packages/db/prisma/seed.ts`'s
 * `ROLE_PERMISSIONS`) since it's a real mutating action (re-calls the AI
 * model), not just visibility.
 */
@Controller("admin/fulfillment")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminReportFulfillmentController {
  constructor(private readonly fulfillmentService: AdminReportFulfillmentService) {}

  @Get("summary")
  @RequirePermission("fulfillment.read")
  getSummary(): Promise<AdminFulfillmentSummaryDto> {
    return this.fulfillmentService.getSummary();
  }

  @Get("orders")
  @RequirePermission("fulfillment.read")
  listOrders(@Query() query: ListAdminFulfillmentOrdersQuery): Promise<ListAdminFulfillmentOrdersResponseDto> {
    return this.fulfillmentService.listOrders(query);
  }

  @Get("orders/:id")
  @RequirePermission("fulfillment.read")
  getOrderDetail(@Param("id", new ParseUUIDPipe()) id: string): Promise<AdminFulfillmentOrderDetailDto> {
    return this.fulfillmentService.getOrderDetail(id);
  }

  @Post("orders/:id/retry")
  @RequirePermission("fulfillment.retry")
  retryOrder(@Param("id", new ParseUUIDPipe()) id: string): Promise<RetryFulfillmentResponseDto> {
    return this.fulfillmentService.retryOrder(id);
  }
}
