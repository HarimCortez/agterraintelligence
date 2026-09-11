import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { MonetizationModule } from "../monetization/monetization.module";
import { AdminReportFulfillmentController } from "./admin-report-fulfillment.controller";
import { AdminReportFulfillmentService } from "./admin-report-fulfillment.service";

/**
 * Admin report fulfillment module (REQUIREMENTS.md Section C.3). Imports
 * `AdminAuthModule` + `TokensModule` for the guards (same pairing
 * `AdminBillingModule` needs — see its doc comment), and `MonetizationModule`
 * to reuse `ReportGenerationService.runGeneration` for the retry action
 * rather than re-implementing report fulfillment's status machine here.
 */
@Module({
  imports: [AdminAuthModule, TokensModule, MonetizationModule],
  controllers: [AdminReportFulfillmentController],
  providers: [AdminReportFulfillmentService],
})
export class AdminReportFulfillmentModule {}
