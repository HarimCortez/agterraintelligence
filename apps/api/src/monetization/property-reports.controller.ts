import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { CurrentUser } from "../identity-access/investor/current-user.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { AuthenticatedInvestorUser } from "../identity-access/investor/investor.types";
import { ReportOrdersService } from "./report-orders.service";
import { CheckoutReportDto } from "./dto/checkout-report.dto";
import { ReportCheckoutResponseDto, ReportOrderDto } from "./dto/monetization-response.dto";

/**
 * Per-property report purchase/listing — `/v1/properties/:id/reports*`.
 * Both routes require an authenticated investor: report ownership and
 * upgrade-credit computation are per-account data, and there is no
 * anonymous "your reports" to list.
 */
@Controller("properties/:id/reports")
@UseGuards(JwtAuthGuard)
export class PropertyReportsController {
  constructor(private readonly reportOrdersService: ReportOrdersService) {}

  @Get()
  list(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("id", new ParseUUIDPipe()) propertyId: string,
  ): Promise<ReportOrderDto[]> {
    return this.reportOrdersService.listForProperty(ctx, propertyId);
  }

  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentAccountContext() ctx: AccountContext,
    @CurrentUser() user: AuthenticatedInvestorUser | undefined,
    @Param("id", new ParseUUIDPipe()) propertyId: string,
    @Body() dto: CheckoutReportDto,
  ): Promise<ReportCheckoutResponseDto> {
    // `user` is guaranteed populated here — JwtAuthGuard runs first.
    return this.reportOrdersService.createCheckout(ctx, propertyId, dto.tier, user!.email);
  }
}
