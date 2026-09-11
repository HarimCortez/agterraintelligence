import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../identity-access/admin/admin-jwt-auth.guard";
import { PermissionsGuard } from "../identity-access/admin/permissions.guard";
import { RequirePermission } from "../identity-access/admin/require-permission.decorator";
import { CurrentAdmin } from "../identity-access/admin/current-admin.decorator";
import { AuthenticatedAdminUser } from "../identity-access/admin/admin.types";
import { AdminSupportService } from "./admin-support.service";
import { ListAdminSupportTicketsQuery } from "./dto/list-support-tickets.query";
import { AddAdminSupportMessageDto, UpdateSupportTicketStatusDto } from "./dto/mutate-support-ticket.dto";
import {
  AdminSupportTicketDetailDto,
  ListAdminSupportTicketsResponseDto,
  RefundTicketOrderResponseDto,
} from "./dto/admin-support.dto";

/**
 * `/v1/admin/support/*`. Reads are gated by `support.read`; replying and
 * changing status by `support.respond`; issuing a refund by the narrower
 * `support.refund` — see `packages/db/prisma/seed.ts`'s `ROLE_PERMISSIONS`.
 */
@Controller("admin/support")
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
export class AdminSupportController {
  constructor(private readonly supportService: AdminSupportService) {}

  @Get("tickets")
  @RequirePermission("support.read")
  listTickets(@Query() query: ListAdminSupportTicketsQuery): Promise<ListAdminSupportTicketsResponseDto> {
    return this.supportService.listTickets(query);
  }

  @Get("tickets/:id")
  @RequirePermission("support.read")
  getTicket(@Param("id", new ParseUUIDPipe()) id: string): Promise<AdminSupportTicketDetailDto> {
    return this.supportService.getTicketById(id);
  }

  @Post("tickets/:id/messages")
  @RequirePermission("support.respond")
  addMessage(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: AddAdminSupportMessageDto,
    @CurrentAdmin() admin: AuthenticatedAdminUser,
  ): Promise<AdminSupportTicketDetailDto> {
    return this.supportService.addMessage(id, admin, input);
  }

  @Patch("tickets/:id/status")
  @RequirePermission("support.respond")
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateSupportTicketStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdminUser,
  ): Promise<AdminSupportTicketDetailDto> {
    return this.supportService.updateStatus(id, admin, input);
  }

  @Post("tickets/:id/refund")
  @RequirePermission("support.refund")
  refund(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdminUser,
  ): Promise<RefundTicketOrderResponseDto> {
    return this.supportService.refundTicketOrder(id, admin);
  }
}
