import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { countRecentWatchdogReaps } from "@/lib/async-jobs";
import { getReportCircuitBreakerStats } from "@/lib/async-report-circuit-breaker";
import { getAsyncWorkerHealth } from "@/lib/async-worker-health";
import { ensureDb, query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const alertQueueN = Math.max(3, Number(process.env.ASYNC_REPORT_ALERT_QUEUE_N) || 8);
  const alertAvgMs = Math.max(
    60_000,
    Number(process.env.ASYNC_REPORT_ALERT_AVG_MS) || 20 * 60_000
  );

  const { rows: statusRows } = await query<{
    status: string;
    kind: string;
    count: string;
  }>(
    `SELECT status, kind, COUNT(*)::text AS count
     FROM async_jobs
     WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY status, kind
     ORDER BY kind, status`
  );

  const { rows: pending } = await query<{
    id: string;
    kind: string;
    user_id: string;
    created_at: Date;
    attempt_count: number;
    next_attempt_at: Date | null;
    error_message: string | null;
  }>(
    `SELECT id, kind, user_id, created_at, attempt_count, next_attempt_at, error_message
     FROM async_jobs
     WHERE status IN ('pending', 'running', 'needs_regeneration')
     ORDER BY
       CASE status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       created_at
     LIMIT 80`
  );

  const { rows: timing } = await query<{
    p50_wait: string | null;
    p95_wait: string | null;
    p50_gen: string | null;
    p95_gen: string | null;
    avg_gen: string | null;
    sum_cost: string | null;
    retries_429: string | null;
    failed_24h: string | null;
    needs_regen_24h: string | null;
    queue_len: string | null;
  }>(
    `SELECT
       percentile_cont(0.5) WITHIN GROUP (ORDER BY queue_wait_ms)
         FILTER (WHERE queue_wait_ms IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours')::text AS p50_wait,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY queue_wait_ms)
         FILTER (WHERE queue_wait_ms IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours')::text AS p95_wait,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY generation_ms)
         FILTER (WHERE generation_ms IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours')::text AS p50_gen,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY generation_ms)
         FILTER (WHERE generation_ms IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours')::text AS p95_gen,
       AVG(generation_ms)
         FILTER (WHERE generation_ms IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours')::text AS avg_gen,
       COALESCE(SUM(llm_cost_rub) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::text AS sum_cost,
       COALESCE(SUM(retry_429_count) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::text AS retries_429,
       COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours')::text AS failed_24h,
       COUNT(*) FILTER (WHERE status = 'needs_regeneration' AND created_at > NOW() - INTERVAL '24 hours')::text AS needs_regen_24h,
       COUNT(*) FILTER (
         WHERE status = 'pending'
           AND kind IN (
             'hd_report','hd_composite_report','pro_premium_report','numerology_reading',
             'natal_interpretation','natal_forecast','natal_compatibility'
           )
       )::text AS queue_len`
  );

  const t = timing[0];
  const queueLen = Number(t?.queue_len ?? 0);
  const avgGen = Number(t?.avg_gen ?? 0);
  const alerts: string[] = [];
  if (queueLen > alertQueueN) {
    alerts.push(`Очередь отчётов длиннее ${alertQueueN}: сейчас ${queueLen}`);
  }
  if (avgGen > alertAvgMs) {
    alerts.push(
      `Средняя генерация выше ${Math.round(alertAvgMs / 60000)} мин: ${Math.round(avgGen / 60000)} мин`
    );
  }
  const cb = getReportCircuitBreakerStats();
  if (cb.open) {
    alerts.push("Circuit breaker: claim отчётов на паузе (провайдер)");
  }
  const provider = await getAsyncWorkerHealth();
  if (provider && !provider.ok) {
    alerts.push(
      `OpenRouter из воркера недоступен: ${provider.error ?? "unknown"} (проверка ${provider.checkedAt})`
    );
  }
  if (provider && !provider.proxyConfigured) {
    alerts.push("OPENROUTER_HTTPS_PROXY не задан в env воркера");
  }
  const watchdogReaps1h = await countRecentWatchdogReaps(1);
  if (watchdogReaps1h > 0) {
    alerts.push(
      `Watchdog за час вернул в очередь ${watchdogReaps1h} задач(и) (лимит ~55 мин)`
    );
  }

  return NextResponse.json({
    statuses: statusRows.map((r) => ({
      status: r.status,
      kind: r.kind,
      count: Number(r.count),
    })),
    queue: pending.map((r) => ({
      id: r.id,
      kind: r.kind,
      userId: r.user_id,
      createdAt: r.created_at.toISOString(),
      attempts: r.attempt_count,
      nextAttemptAt: r.next_attempt_at?.toISOString() ?? null,
      error: r.error_message,
    })),
    metrics: {
      p50WaitMs: t?.p50_wait != null ? Number(t.p50_wait) : null,
      p95WaitMs: t?.p95_wait != null ? Number(t.p95_wait) : null,
      p50GenMs: t?.p50_gen != null ? Number(t.p50_gen) : null,
      p95GenMs: t?.p95_gen != null ? Number(t.p95_gen) : null,
      avgGenMs: t?.avg_gen != null ? Number(t.avg_gen) : null,
      costRub24h: Number(t?.sum_cost ?? 0),
      retries429_24h: Number(t?.retries_429 ?? 0),
      failed24h: Number(t?.failed_24h ?? 0),
      needsRegeneration24h: Number(t?.needs_regen_24h ?? 0),
      queueLen,
      watchdogReaps1h,
    },
    circuitBreaker: cb,
    provider,
    alerts,
  });
}
