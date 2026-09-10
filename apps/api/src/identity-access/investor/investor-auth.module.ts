import { Module } from "@nestjs/common";
import { TokensModule } from "../tokens/tokens.module";
import { ExternalRolesGuard } from "./external-roles.guard";
import { InvestorAuthController } from "./investor-auth.controller";
import { InvestorAuthService } from "./investor-auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [TokensModule],
  controllers: [InvestorAuthController],
  providers: [InvestorAuthService, JwtAuthGuard, ExternalRolesGuard],
  // Guards are exported so feature modules built in later phases can apply
  // them to their own controllers (`@UseGuards(JwtAuthGuard, ExternalRolesGuard)`)
  // without re-providing them.
  exports: [InvestorAuthService, JwtAuthGuard, ExternalRolesGuard],
})
export class InvestorAuthModule {}
