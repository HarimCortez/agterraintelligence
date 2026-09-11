import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { SupportService } from "./support.service";
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  GetSupportTicketsResponseDto,
  SupportTicketDto,
} from "./dto/support.dto";

/**
 * Support API — investor-plane endpoints for filing and following up on
 * support tickets. All endpoints require JWT authentication and are
 * scoped to the current user's own tickets (ownership baked into every
 * query, never checked after the fact).
 */
@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /** GET /v1/support/tickets */
  @Get("tickets")
  async listTickets(@CurrentAccountContext() ctx: AccountContext): Promise<GetSupportTicketsResponseDto> {
    return this.supportService.listForAccount(ctx);
  }

  /** POST /v1/support/tickets */
  @Post("tickets")
  async createTicket(
    @CurrentAccountContext() ctx: AccountContext,
    @Body() input: CreateTicketDto,
  ): Promise<SupportTicketDto> {
    return this.supportService.createForAccount(ctx, input);
  }

  /** GET /v1/support/tickets/:id */
  @Get("tickets/:id")
  async getTicket(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<SupportTicketDto> {
    return this.supportService.getById(ctx, id);
  }

  /** POST /v1/support/tickets/:id/messages */
  @Post("tickets/:id/messages")
  async addMessage(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: CreateTicketMessageDto,
  ): Promise<SupportTicketDto> {
    return this.supportService.addMessageForAccount(ctx, id, input);
  }
}
