import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { ReportGenerationService } from "../monetization/report-generation.service";
import { ListAdminFulfillmentOrdersQuery } from "./dto/list-fulfillment-orders.query";
import {
  AdminFulfillmentOrderDetailDto,
  AdminFulfillmentSummaryDto,
  ListAdminFulfillmentOrdersResponseDto,
  RetryFulfillmentResponseDto,
} from "./dto/admin-fulfillment.dto";

/**
 * Report Fulfillment admin operations (REQUIREMENTS.md Section C.3):
 * order/pipeline visibility, order detail (including generated content),
 * and retrying a `failed` order. Deliberately NOT here (real follow-up
 * scope, not faked):
 * - Refund tooling — same reasoning as `admin-billing.service.ts`: a real
 *   financial action needing its own review-step design, not something to
 *   bolt onto a fulfillment retry action.
 * - Download (PDF) — REQUIREMENTS.md decision log #10 defers real PDF
 *   rendering entirely; a report is a page in the app, not a file, in this
 *   pass. The order-detail endpoint here does expose the full `content`
 *   JSON, which is the real substitute for "download" today.
 */
@Injectable()
export class AdminReportFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportGeneration: ReportGenerationService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getSummary(): Promise<AdminFulfillmentSummaryDto> {
    const [ordersByStatusRows, deliveredOrders] = await Promise.all([
      this.prisma.reportOrder.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.reportOrder.findMany({
        where: { status: "delivered" },
        select: { createdAt: true, updatedAt: true },
      }),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const row of ordersByStatusRows) {
      ordersByStatus[row.status] = row._count._all;
    }

    const averageFulfillmentSeconds =
      deliveredOrders.length === 0
        ? null
        : deliveredOrders.reduce((sum, o) => sum + (o.updatedAt.getTime() - o.createdAt.getTime()) / 1000, 0) /
          deliveredOrders.length;

    return {
      ordersByStatus,
      averageFulfillmentSeconds,
      failedOrderCount: ordersByStatus["failed"] ?? 0,
    };
  }

  async listOrders(query: ListAdminFulfillmentOrdersQuery): Promise<ListAdminFulfillmentOrdersResponseDto> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.reportTierCode ? { reportTierCode: query.reportTierCode } : {}),
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.reportOrder.findMany({
        where,
        include: { user: { select: { email: true } }, property: { select: { address: true } } },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.reportOrder.count({ where }),
    ]);

    return {
      results: rows.map((row) => ({
        id: row.id,
        userEmail: row.user.email,
        propertyId: row.propertyId,
        propertyAddress: row.property.address,
        reportTierCode: row.reportTierCode,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hasContent: row.content !== null,
      })),
      total,
      limit,
      offset,
    };
  }

  async getOrderDetail(id: string): Promise<AdminFulfillmentOrderDetailDto> {
    const row = await this.prisma.reportOrder.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, property: { select: { address: true } } },
    });
    if (!row) {
      throw new NotFoundException(`Report order ${id} not found`);
    }

    return {
      id: row.id,
      userEmail: row.user.email,
      propertyId: row.propertyId,
      propertyAddress: row.property.address,
      reportTierCode: row.reportTierCode,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hasContent: row.content !== null,
      pricePaidCents: row.pricePaidCents,
      priceBasis: row.priceBasis,
      content: row.content,
    };
  }

  /**
   * Retries generation for a `failed` order only — payment already
   * succeeded on the original attempt (that's the only way an order
   * reaches `failed` at all; see `report-generation.service.ts`), so this
   * is purely a content-regeneration action, never a new charge. Any other
   * current status is rejected with 409: retrying a `delivered` order
   * would silently overwrite real content, and every other status is
   * mid-flight already.
   */
  async retryOrder(id: string, admin: AuthenticatedAdminUser): Promise<RetryFulfillmentResponseDto> {
    const order = await this.prisma.reportOrder.findUnique({ where: { id }, select: { status: true } });
    if (!order) {
      throw new NotFoundException(`Report order ${id} not found`);
    }
    if (order.status !== "failed") {
      throw new ConflictException(`Report order ${id} is '${order.status}', not 'failed' — nothing to retry`);
    }

    await this.reportGeneration.runGeneration(id);

    const updated = await this.prisma.reportOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "fulfillment.retry",
      targetType: "report_order",
      targetId: id,
      metadata: { previousStatus: "failed", resultStatus: updated.status },
    });
    return { id, status: updated.status };
  }
}
