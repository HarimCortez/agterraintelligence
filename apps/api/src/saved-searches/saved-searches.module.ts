import { Module } from "@nestjs/common";
import { SavedSearchesController } from "./saved-searches.controller";
import { SavedSearchesService } from "./saved-searches.service";
import { InvestorAuthModule } from "../identity-access/investor/investor-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";

/**
 * Saved Searches domain module — investor-plane endpoints for creating/reading/updating/deleting
 * user-defined saved search criteria.
 *
 * Imports InvestorAuthModule to access JwtAuthGuard and related auth services.
 * Also imports TokensModule to provide TokenService (a dependency of JwtAuthGuard).
 * PrismaService is injected from PrismaModule (@Global() at identity-access level).
 */
@Module({
  imports: [TokensModule, InvestorAuthModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
})
export class SavedSearchesModule {}
