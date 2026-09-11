import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminDataQualityController } from "./admin-data-quality.controller";
import { AdminDataQualityService } from "./admin-data-quality.service";

@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminDataQualityController],
  providers: [AdminDataQualityService],
})
export class AdminDataQualityModule {}
