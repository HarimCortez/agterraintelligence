import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global module so any current or future domain module can `@Inject`
 * `PrismaService` without re-importing this module — matches the standard
 * Nest + Prisma pattern and avoids every domain module (Property, Scoring,
 * Monetization, ...) having to redeclare the dependency as they're added in
 * later phases.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
