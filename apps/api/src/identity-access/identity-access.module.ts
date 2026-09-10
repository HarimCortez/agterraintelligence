import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountContextModule } from "../common/account-context/account-context.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { AdminAuthModule } from "./admin/admin-auth.module";
import { InvestorAuthModule } from "./investor/investor-auth.module";

/**
 * Identity & Access — Phase 0's foundational module (ARCHITECTURE.md
 * "Components Affected" #1 / "Build sequence" Phase 0). Composes:
 *
 * - `PrismaModule` / `AccountContextModule` — data-layer + org-seam
 *   infrastructure every later domain module will also depend on.
 * - `InvestorAuthModule` — `/v1/auth/*`, the `users` plane.
 * - `AdminAuthModule` — `/v1/admin/auth/*`, the `admin_users` plane.
 * - App-wide rate limiting (`ThrottlerModule` + a global `APP_GUARD`), with
 *   auth routes overriding tighter per-route limits via `@Throttle(...)` —
 *   see `InvestorAuthController`/`AdminAuthController`.
 *
 * The two auth sub-modules are intentionally NOT merged into one — keeping
 * them as separate Nest modules (own controllers/services/guards) mirrors
 * the "two fully separate authentication planes" decision at the code
 * structure level, not just at the JWT-config level.
 */
@Module({
  imports: [
    PrismaModule,
    AccountContextModule,
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
    InvestorAuthModule,
    AdminAuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [InvestorAuthModule, AdminAuthModule],
})
export class IdentityAccessModule {}
