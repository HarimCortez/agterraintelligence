import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { PropertiesService } from "../properties/properties.service";
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  GetSupportTicketsResponseDto,
  SupportTicketDto,
  SupportTicketMessageDto,
  SupportTicketSummaryDto,
} from "./dto/support.dto";

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  relatedReportOrderId: string | null;
  relatedPropertyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  senderType: string;
  body: string;
  isInternalNote: boolean;
  createdAt: Date;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
  ) {}

  /** GET /v1/support/tickets — this user's own tickets only. */
  async listForAccount(ctx: AccountContext): Promise<GetSupportTicketsResponseDto> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: ctx.scopeId },
      orderBy: { updatedAt: "desc" },
    });

    return { tickets: tickets.map(toSummaryDto), count: tickets.length };
  }

  /**
   * POST /v1/support/tickets. Creates the ticket and its opening message
   * in one transaction — a ticket with zero messages would be a broken
   * conversation, not a valid empty state.
   */
  async createForAccount(ctx: AccountContext, input: CreateTicketDto): Promise<SupportTicketDto> {
    if (input.relatedReportOrderId) {
      const order = await this.prisma.reportOrder.findFirst({
        where: { id: input.relatedReportOrderId, userId: ctx.scopeId },
        select: { id: true },
      });
      if (!order) {
        throw new BadRequestException("relatedReportOrderId does not refer to one of your report orders");
      }
    }

    if (input.relatedPropertyId) {
      // Reuses PropertiesService's existing 404 handling rather than
      // duplicating a raw findUnique + not-found check here.
      await this.propertiesService.getPropertyById(input.relatedPropertyId);
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          userId: ctx.scopeId,
          subject: input.subject.trim(),
          relatedReportOrderId: input.relatedReportOrderId ?? null,
          relatedPropertyId: input.relatedPropertyId ?? null,
        },
      });
      await tx.supportTicketMessage.create({
        data: {
          ticketId: created.id,
          senderType: "user",
          senderUserId: ctx.scopeId,
          body: input.body.trim(),
        },
      });
      return created;
    });

    return this.getById(ctx, ticket.id);
  }

  /** GET /v1/support/tickets/:id. Ownership-scoped; internal notes are never included. */
  async getById(ctx: AccountContext, id: string): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId: ctx.scopeId } });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }

    const messages = await this.prisma.supportTicketMessage.findMany({
      where: { ticketId: id, isInternalNote: false },
      orderBy: { createdAt: "asc" },
    });

    return { ...toSummaryDto(ticket), messages: messages.map(toMessageDto) };
  }

  /**
   * POST /v1/support/tickets/:id/messages. Blocked on a closed ticket —
   * REQUIREMENTS.md's ticket lifecycle doesn't specify reopening, so the
   * simplest correct behavior is "file a new ticket" rather than silently
   * allowing new activity on one an admin has already closed out.
   */
  async addMessageForAccount(
    ctx: AccountContext,
    id: string,
    input: CreateTicketMessageDto,
  ): Promise<SupportTicketDto> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId: ctx.scopeId } });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with id ${id} not found`);
    }
    if (ticket.status === "closed") {
      throw new ConflictException("This ticket is closed. Please open a new ticket.");
    }

    await this.prisma.supportTicketMessage.create({
      data: { ticketId: id, senderType: "user", senderUserId: ctx.scopeId, body: input.body.trim() },
    });
    // Explicitly touch updatedAt so the ticket resurfaces at the top of
    // the list — a new message doesn't otherwise change any column on
    // the ticket row itself.
    await this.prisma.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } });

    return this.getById(ctx, id);
  }
}

function toSummaryDto(ticket: TicketRow): SupportTicketSummaryDto {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    relatedReportOrderId: ticket.relatedReportOrderId,
    relatedPropertyId: ticket.relatedPropertyId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function toMessageDto(message: MessageRow): SupportTicketMessageDto {
  return {
    id: message.id,
    senderType: message.senderType as "user" | "admin",
    body: message.body,
    createdAt: message.createdAt,
  };
}
