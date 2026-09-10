import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { ReportOrdersService } from "./report-orders.service";
import { ReportOrderDto } from "./dto/monetization-response.dto";

/**
 * GET /v1/report-orders/:id — authenticated, ownership-scoped lookup of a
 * single report order (returns `content` once `status: "delivered"`).
 */
@Controller("report-orders")
@UseGuards(JwtAuthGuard)
export class ReportOrdersController {
  constructor(private readonly reportOrdersService: ReportOrdersService) {}

  @Get(":id")
  getById(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<ReportOrderDto> {
    return this.reportOrdersService.getById(ctx, id);
  }
}
