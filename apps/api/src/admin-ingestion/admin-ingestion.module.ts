import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../identity-access/admin/admin-auth.module";
import { TokensModule } from "../identity-access/tokens/tokens.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { AdminIngestionController } from "./admin-ingestion.controller";
import { AdminIngestionService } from "./admin-ingestion.service";

/** Admin ingestion module. Same guard-module pairing as `AdminBillingModule`; imports `IngestionModule` for `FemaFloodZoneIngestionService`. */
@Module({
  imports: [AdminAuthModule, TokensModule, IngestionModule],
  controllers: [AdminIngestionController],
  providers: [AdminIngestionService],
})
export class AdminIngestionModule {}
