import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { CurrentUser } from "../identity-access/investor/current-user.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { AuthenticatedInvestorUser } from "../identity-access/investor/investor.types";
import { SubscriptionsService } from "./subscriptions.service";
import { CheckoutSubscriptionDto } from "./dto/checkout-subscription.dto";
import { SubscriptionCheckoutResponseDto, SubscriptionMeDto } from "./dto/monetization-response.dto";

/**
 * Subscription plan self-serve endpoints — `/v1/subscriptions/*`. Both
 * routes require an authenticated investor (`JwtAuthGuard`); there is no
 * account-scoped subscription data to look up or checkout to create for an
 * anonymous caller.
 */
@Controller("subscriptions")
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("me")
  getMe(@CurrentAccountContext() ctx: AccountContext): Promise<SubscriptionMeDto> {
    return this.subscriptionsService.getMe(ctx);
  }

  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentAccountContext() ctx: AccountContext,
    @CurrentUser() user: AuthenticatedInvestorUser | undefined,
    @Body() dto: CheckoutSubscriptionDto,
  ): Promise<SubscriptionCheckoutResponseDto> {
    // `user` is guaranteed populated here — JwtAuthGuard runs first and
    // throws before this handler if it isn't.
    return this.subscriptionsService.createCheckout(ctx, dto, user!.email);
  }
}
