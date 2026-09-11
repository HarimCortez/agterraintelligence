import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditService } from "./admin-audit.service";

/** Admin audit log module. Same guard-module pairing as `AdminBillingModule` — see its doc comment. */
@Module({
  imports: [AdminAuthModule, TokensModule],
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
})
export class AdminAuditModule {}
