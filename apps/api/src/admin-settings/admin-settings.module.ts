import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsService } from "./admin-settings.service";

@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
})
export class AdminSettingsModule {}
