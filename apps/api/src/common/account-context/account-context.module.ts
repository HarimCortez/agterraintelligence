import { Global, Module } from "@nestjs/common";
import { AccountContextService } from "./account-context.service";

/**
 * Global so any domain module can inject `AccountContextService` (for
 * non-request contexts) without an explicit import — the org-seam
 * abstraction is meant to be ambient infrastructure, not something each
 * feature module opts into separately.
 */
@Global()
@Module({
  providers: [AccountContextService],
  exports: [AccountContextService],
})
export class AccountContextModule {}
