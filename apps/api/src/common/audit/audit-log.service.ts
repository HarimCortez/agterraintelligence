import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@agterra/db";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordAuditEntryInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Shared audit-log writer — global (see `audit-log.module.ts`) so any
 * domain module can record an entry without a fresh import, matching
 * `PrismaModule`'s pattern. Deliberately fire-and-forget from the
 * caller's perspective is NOT how this is used: callers `await` this, but
 * a failure to write an audit row must never fail the action being
 * audited itself (a login or a retry succeeding is real regardless of
 * whether the audit write lands) — so failures are caught and logged
 * here, not propagated.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLogEntry.create({
        data: {
          actorId: input.actorId ?? null,
          actorEmail: input.actorEmail ?? null,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log entry for action '${input.action}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
