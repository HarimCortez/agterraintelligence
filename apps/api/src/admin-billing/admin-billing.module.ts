import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminBillingController } from "./admin-billing.controller";
import { AdminBillingService } from "./admin-billing.service";

/**
 * Admin billing/entitlements module (REQUIREMENTS.md Section C.2).
 * Imports `AdminAuthModule` for `AdminJwtAuthGuard`/`PermissionsGuard`, and
 * `TokensModule` because `AdminJwtAuthGuard` depends on `TokenService` —
 * same pairing `MonetizationModule` already needs for `JwtAuthGuard`.
 * `PrismaService` is global, available without importing anything extra.
 */
@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminBillingController],
  providers: [AdminBillingService],
})
export class AdminBillingModule {}
