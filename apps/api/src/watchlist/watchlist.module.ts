import { Module } from "@nestjs/common";
import { WatchlistController } from "./watchlist.controller";
import { WatchlistService } from "./watchlist.service";
import { PropertiesModule } from "../properties/properties.module";
import { InvestorAuthModule } from "../identity-access/investor/investor-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";

/**
 * Watchlist domain module — investor-plane endpoints for adding/removing/listing
 * watched properties.
 *
 * Depends on PropertiesModule for property-detail-shape logic (reuses
 * `getPropertyById` instead of duplicating geography/SQL handling).
 * Imports InvestorAuthModule to access JwtAuthGuard and related auth services.
 * Also imports TokensModule to provide TokenService (a dependency of JwtAuthGuard).
 *
 * PrismaService is injected from PrismaModule (@Global() at identity-access level).
 */
@Module({
  imports: [PropertiesModule, TokensModule, InvestorAuthModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
