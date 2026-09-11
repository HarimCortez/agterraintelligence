import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { InvestorAuthModule } from "../identity-access/investor/investor-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

/**
 * Support domain module — investor-plane ticket filing/follow-up. Mirrors
 * WatchlistModule/SavedSearchesModule's import shape (TokensModule +
 * InvestorAuthModule for JwtAuthGuard, PropertiesModule reused for
 * property-lookup 404 handling on ticket creation).
 */
@Module({
  imports: [PropertiesModule, TokensModule, InvestorAuthModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
