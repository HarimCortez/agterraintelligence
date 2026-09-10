import { Module } from "@nestjs/common";
import { TokensModule } from "../tokens/tokens.module";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { MfaService } from "./mfa.service";
import { PermissionsGuard } from "./permissions.guard";
import { PermissionsService } from "./permissions.service";

@Module({
  imports: [TokensModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, MfaService, AdminJwtAuthGuard, PermissionsService, PermissionsGuard],
  // Exported so future admin domain modules (Billing, Fulfillment,
  // Ingestion, Support, ...) can apply the guards to their own controllers
  // without re-providing them.
  exports: [AdminAuthService, AdminJwtAuthGuard, PermissionsService, PermissionsGuard],
})
export class AdminAuthModule {}
