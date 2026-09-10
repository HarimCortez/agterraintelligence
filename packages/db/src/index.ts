/**
 * @agterra/db — thin re-export of the generated Prisma client and types.
 *
 * This package owns the schema (`prisma/schema.prisma`), migrations
 * (`prisma/migrations/`), and the generated `@prisma/client` package. It
 * intentionally does NOT include a NestJS module/provider (e.g. a
 * `PrismaService` with `onModuleInit`/`onModuleDestroy` lifecycle hooks) —
 * that wiring belongs to `apps/api`'s Identity & Access module, built by
 * `be` on top of this package. Data's responsibility ends at "a valid,
 * migrated schema and a generated client `be` can import."
 *
 * Usage from apps/api (once `be` adds the dependency/module wiring):
 *
 *   import { PrismaClient } from "@agterra/db";
 *   const prisma = new PrismaClient();
 *
 * or, for NestJS DI, wrap this in a small PrismaService that calls
 * `this.$connect()` in `onModuleInit` and `this.$disconnect()` in
 * `onModuleDestroy` — standard Prisma + NestJS pattern, not included here
 * since it's application wiring, not data-layer scope.
 */
export * from "@prisma/client";
