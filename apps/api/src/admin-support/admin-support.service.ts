import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { StripeClientService } from "../monetization/stripe-client.service";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { ListAdminSupportTicketsQuery } from "./dto/list-support-tickets.query";
import { AddAdminSupportMessageDto, UpdateSupportTicketStatusDto } from "./dto/mutate-support-ticket.dto";
import {
  AdminSupportTicketDetailDto,
  AdminSupportTicketSummaryDto,
  ListAdminSupportTicketsResponseDto,
  RefundTicketOrderResponseDto,
} from "./dto/admin-support.dto";

const TICKET_WITH_CONTEXT_INCLUDE = {
  user: { select: { email: true } },
  assignedAdmin: { select: { email: true } },
} as const;

/**
 * Support Center admin operations (REQUIREMENTS.md Section 6/10.2): ticket
 * list/detail with full conversation, internal notes, and a real Stripe
 * refund action against a ticket's related `ReportOrder`. The refund is
 * the real financial action `admin-report-fulfillment.service.ts` and
 * `admin-billing.service.ts` both explicitly deferred as needing "its own
 * review-step design" — a ticket (someone looked at the situation, wrote
 * up why) is that review step.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stripeClient: StripeClientService,
  ) {}

  async listTickets(query: ListAdminSupportTicketsQuery): Promise<ListAdminSupportTicketsResponseDto> {
    const where = query.status ? { status: query.status } : {};
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: TICKET_WITH_CONTEXT_INCLUDE,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { results: rows.map(toSummaryDto), total, limit, offset };
  }

  async getTicketById(id: string): Promise<AdminSupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        ...TICKET_WITH_CONTEXT_INCLUDE,
        relatedReportOrder: { select: { id: true, status: true, reportTierCode: true, pricePaidCents: true, stripePaymentIntentId: true, createdAt: true } },
        relatedProperty: { select: { id: true, address: true, county: true } },
      },
    });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }

    const [messages, user] = await Promise.all([
      this.prisma.supportTicketMessage.findMany({
        where: { ticketId: id },
        include: { senderUser: { select: { email: true } }, senderAdmin: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: ticket.userId },
        select: { id: true, email: true, externalRole: true, status: true },
      }),
    ]);

    return {
      ...toSummaryDto(ticket),
      messages: messages.map((m) => ({
        id: m.id,
        senderType: m.senderType as "user" | "admin",
        senderEmail: m.senderUser?.email ?? m.senderAdmin?.email ?? null,
        body: m.body,
        isInternalNote: m.isInternalNote,
        createdAt: m.createdAt,
      })),
      user,
      relatedReportOrder: ticket.relatedReportOrder
        ? {
            id: ticket.relatedReportOrder.id,
            status: ticket.relatedReportOrder.status,
            reportTierCode: ticket.relatedReportOrder.reportTierCode,
            pricePaidCents: ticket.relatedReportOrder.pricePaidCents,
            hasPaymentToRefund: ticket.relatedReportOrder.stripePaymentIntentId !== null,
            createdAt: ticket.relatedReportOrder.createdAt,
          }
        : null,
      relatedProperty: ticket.relatedProperty,
    };
  }

  /**
   * A reply (isInternalNote: false) auto-transitions an `open` ticket to
   * `in_progress` — the first admin response is exactly the signal
   * "someone started working this," and requiring a separate manual status
   * click for that specific transition would just be friction. A note
   * never changes status; neither does replying to a ticket already past
   * `open`.
   */
  async addMessage(id: string, admin: AuthenticatedAdminUser, input: AddAdminSupportMessageDto): Promise<AdminSupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: { status: true } });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }

    const isInternalNote = input.isInternalNote ?? false;
    await this.prisma.supportTicketMessage.create({
      data: { ticketId: id, senderType: "admin", senderAdminId: admin.id, body: input.body.trim(), isInternalNote },
    });
    await this.prisma.supportTicket.update({
      where: { id },
      data: { status: !isInternalNote && ticket.status === "open" ? "in_progress" : undefined, updatedAt: new Date() },
    });

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: isInternalNote ? "support.note" : "support.respond",
      targetType: "support_ticket",
      targetId: id,
      metadata: { isInternalNote },
    });

    return this.getTicketById(id);
  }

  async updateStatus(id: string, admin: AuthenticatedAdminUser, input: UpdateSupportTicketStatusDto): Promise<AdminSupportTicketDetailDto> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: { status: true } });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }

    await this.prisma.supportTicket.update({ where: { id }, data: { status: input.status } });

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "support.status_update",
      targetType: "support_ticket",
      targetId: id,
      metadata: { previousStatus: ticket.status, newStatus: input.status },
    });

    return this.getTicketById(id);
  }

  /**
   * Issues a real Stripe refund against the ticket's related `ReportOrder`,
   * using the payment intent already stored on it from checkout. Guards,
   * in order: ticket exists, has a related order, that order was actually
   * paid (has a payment intent — a `pending_payment` order was never
   * charged), and isn't already refunded (idempotency — Stripe itself
   * would also reject a double refund, but this gives a clean 409 instead
   * of surfacing a raw Stripe error).
   */
  async refundTicketOrder(id: string, admin: AuthenticatedAdminUser): Promise<RefundTicketOrderResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { relatedReportOrder: { select: { id: true, status: true, stripePaymentIntentId: true } } },
    });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }
    if (!ticket.relatedReportOrder) {
      throw new BadRequestException("This ticket has no related report order to refund");
    }
    const order = ticket.relatedReportOrder;
    if (order.status === "refunded") {
      throw new ConflictException(`Report order ${order.id} has already been refunded`);
    }
    if (!order.stripePaymentIntentId) {
      throw new ConflictException(`Report order ${order.id} was never paid — nothing to refund`);
    }

    const stripe = this.stripeClient.getClient();
    const refund = await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });

    const updatedOrder = await this.prisma.reportOrder.update({
      where: { id: order.id },
      data: { status: "refunded" },
      select: { id: true, status: true },
    });

    await this.auditLog.record({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "support.refund",
      targetType: "report_order",
      targetId: order.id,
      metadata: { supportTicketId: id, stripeRefundId: refund.id },
    });

    return { reportOrderId: updatedOrder.id, stripeRefundId: refund.id, status: updatedOrder.status };
  }
}

interface TicketWithContextRow {
  id: string;
  subject: string;
  status: string;
  relatedReportOrderId: string | null;
  relatedPropertyId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { email: string };
  assignedAdmin: { email: string } | null;
}

function toSummaryDto(ticket: TicketWithContextRow): AdminSupportTicketSummaryDto {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status as AdminSupportTicketSummaryDto["status"],
    userEmail: ticket.user.email,
    assignedAdminEmail: ticket.assignedAdmin?.email ?? null,
    relatedReportOrderId: ticket.relatedReportOrderId,
    relatedPropertyId: ticket.relatedPropertyId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}
