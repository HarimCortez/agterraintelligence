import { Controller, Get, Post, Delete, Param, ParseUUIDPipe, HttpCode, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { CurrentAccountContext } from "../common/account-context/current-account-context.decorator";
import { AccountContext } from "../common/account-context/account-context";
import { WatchlistService } from "./watchlist.service";
import { GetWatchlistResponseDto, WatchlistItemDto } from "./dto/watchlist.dto";

/**
 * Watchlist API — investor-plane endpoints for managing watched properties.
 * All endpoints require JWT authentication (JwtAuthGuard).
 */
@Controller("watchlist")
@UseGuards(JwtAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  /**
   * GET /v1/watchlist
   * List the current user's watched properties with full property details.
   * Joined data includes opportunity score, valuation, risk flag count.
   */
  @Get()
  async getWatchlist(@CurrentAccountContext() ctx: AccountContext): Promise<GetWatchlistResponseDto> {
    return this.watchlistService.listForAccount(ctx);
  }

  /**
   * POST /v1/watchlist/:propertyId
   * Add a property to the current user's watchlist.
   * Idempotent: if already watched, return 200 success, not 409 conflict.
   * 404 if property doesn't exist.
   * 400 if propertyId is not a valid UUID (ParseUUIDPipe).
   */
  @Post(":propertyId")
  async addToWatchlist(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
  ): Promise<WatchlistItemDto> {
    return this.watchlistService.addToWatchlist(ctx, propertyId);
  }

  /**
   * DELETE /v1/watchlist/:propertyId
   * Remove a property from the current user's watchlist.
   * 204 whether or not it was actually watched (idempotent).
   * Scoped to current user by design (no extra permission check needed).
   */
  @Delete(":propertyId")
  @HttpCode(204)
  async removeFromWatchlist(
    @CurrentAccountContext() ctx: AccountContext,
    @Param("propertyId", new ParseUUIDPipe()) propertyId: string,
  ): Promise<void> {
    return this.watchlistService.removeFromWatchlist(ctx, propertyId);
  }
}
