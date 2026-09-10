import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@agterra/db";

/**
 * NestJS-idiomatic wrapper around `@agterra/db`'s generated `PrismaClient`.
 *
 * `@agterra/db` deliberately ships no NestJS wiring (see its `src/index.ts`
 * and root `CLAUDE.md`'s "Database" section) — this is that wiring, added by
 * `be` as part of the Identity & Access module. Connects on module init and
 * disconnects on module destroy so the pool lifecycle follows Nest's
 * application lifecycle rather than leaking connections across hot reloads
 * or being left open on shutdown.
 *
 * Injectable anywhere `PrismaModule` is imported (it's `@Global()`, see
 * `prisma.module.ts`, so every future domain module gets it for free).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma client connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma client disconnected");
  }
}
