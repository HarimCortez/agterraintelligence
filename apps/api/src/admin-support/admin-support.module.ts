import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { MonetizationModule } from "../monetization/monetization.module";
import { AdminSupportController } from "./admin-support.controller";
import { AdminSupportService } from "./admin-support.service";

/** Admin Support Center module. Imports MonetizationModule for StripeClientService (the refund action). */
@Module({
  imports: [AdminAuthModule, TokensModule, MonetizationModule],
  controllers: [AdminSupportController],
  providers: [AdminSupportService],
})
export class AdminSupportModule {}
