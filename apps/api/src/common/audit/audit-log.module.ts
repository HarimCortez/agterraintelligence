import { Global, Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";

/** Global, mirrors `PrismaModule`'s pattern — see its doc comment for why. */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
