import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminRevenueController } from "./admin-revenue.controller";
import { AdminRevenueService } from "./admin-revenue.service";

/** Admin revenue analytics module (REQUIREMENTS.md Section C.8). Same guard-module pairing as `AdminBillingModule` — see its doc comment. */
@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminRevenueController],
  providers: [AdminRevenueService],
})
export class AdminRevenueModule {}
