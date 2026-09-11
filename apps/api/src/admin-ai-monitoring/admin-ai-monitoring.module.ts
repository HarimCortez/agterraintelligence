import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminAiMonitoringController } from "./admin-ai-monitoring.controller";
import { AdminAiMonitoringService } from "./admin-ai-monitoring.service";

@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminAiMonitoringController],
  providers: [AdminAiMonitoringService],
})
export class AdminAiMonitoringModule {}
