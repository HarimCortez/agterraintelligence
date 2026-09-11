import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma/prisma.service";
import { AiMonitoringTrendQuery } from "./dto/ai-monitoring-trend.query";
import { ListAiCallLogsQuery } from "./dto/list-ai-call-logs.query";
import {
  AiMonitoringSummaryDto,
  AiMonitoringTrendDayDto,
  ListAiCallLogsResponseDto,
} from "./dto/admin-ai-monitoring.dto";

/**
 * AI & Model Monitoring admin operations (REQUIREMENTS.md Section
 * 6/9.4/10.2). Reads exclusively from `ai_call_logs`, which records real
 * volume/success/latency for every Anthropic call across both AI features
 * (AI Analyst, report generation) — see that table's schema doc comment
 * for why it exists and where it's written from
 * (`AnthropicToolCallerService.callForcedTool`).
 *
 * Deliberately NOT here — most of what REQUIREMENTS.md's fuller AI &
 * Model Monitoring spec asks for: prediction accuracy (no ground truth
 * exists to score against), user feedback (no feedback endpoint/UI
 * exists — same gap `ai_interactions`'s own schema comment already
 * flags), uptime tracking, alerting, and guardrail/safety metrics beyond
 * "did the call fail." `modelConfigured` below is the one real,
 * checkable "model status" signal available today (is
 * `ANTHROPIC_API_KEY` actually set) — not a fabricated health score.
 */
@Injectable()
export class AdminAiMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(): Promise<AiMonitoringSummaryDto> {
    const [statusRows, featureRows, durationAgg] = await Promise.all([
      this.prisma.aiCallLog.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.aiCallLog.groupBy({ by: ["feature"], _count: { _all: true } }),
      this.prisma.aiCallLog.aggregate({ _avg: { durationMs: true } }),
    ]);

    const succeededCount = statusRows.find((r) => r.status === "succeeded")?._count._all ?? 0;
    const failedCount = statusRows.find((r) => r.status === "failed")?._count._all ?? 0;
    const totalCalls = succeededCount + failedCount;

    const callsByFeature: Record<string, number> = {};
    for (const row of featureRows) {
      callsByFeature[row.feature] = row._count._all;
    }

    return {
      totalCalls,
      succeededCount,
      failedCount,
      successRatePct: totalCalls === 0 ? null : Math.round((succeededCount / totalCalls) * 1000) / 10,
      averageResponseMs: durationAgg._avg.durationMs == null ? null : Math.round(durationAgg._avg.durationMs),
      callsByFeature,
      modelConfigured: Boolean(this.config.get<string>("ANTHROPIC_API_KEY")),
    };
  }

  async getTrend(query: AiMonitoringTrendQuery): Promise<{ points: AiMonitoringTrendDayDto[] }> {
    const days = query.days ?? 14;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const calls = await this.prisma.aiCallLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    });

    const buckets = new Map<string, { succeeded: number; failed: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      buckets.set(dayKey(d), { succeeded: 0, failed: 0 });
    }
    for (const call of calls) {
      const bucket = buckets.get(dayKey(call.createdAt));
      if (!bucket) continue;
      if (call.status === "succeeded") bucket.succeeded += 1;
      else bucket.failed += 1;
    }

    return { points: Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v })) };
  }

  async listCalls(query: ListAiCallLogsQuery): Promise<ListAiCallLogsResponseDto> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.feature ? { feature: query.feature } : {}),
    };
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.aiCallLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      this.prisma.aiCallLog.count({ where }),
    ]);

    return { results: rows, total, limit, offset };
  }
}

/** UTC YYYY-MM-DD key for day-bucketing — same as admin-revenue.service.ts's helper. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
