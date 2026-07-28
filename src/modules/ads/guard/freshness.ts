/**
 * B2 — blind-flight protection. Independent of rules flags.
 */
import { adsQuery } from "../db";
import { getConfigJson, setConfigJson } from "../config";
import { safetyPauseAll } from "./pause-all";

export async function getStaleConfig() {
  const warn = await getConfigJson<number>("stats_stale_warn_hours");
  const stop = await getConfigJson<number>("stats_stale_stop_hours");
  return {
    warnHours: typeof warn === "number" ? warn : 24,
    stopHours: typeof stop === "number" ? stop : 48,
  };
}

export async function hoursSinceLastDailyStats(): Promise<number | null> {
  // daily_stats has no synced_at — use MAX(date) end-of-day as freshness proxy
  const { rows } = await adsQuery<{ d: string | null }>(
    `SELECT MAX(date)::text AS d FROM ads.daily_stats`
  );
  const d = rows[0]?.d;
  if (!d) return null;
  const end = new Date(`${d}T23:59:59Z`).getTime();
  return (Date.now() - end) / 3600000;
}

export async function hoursSinceMetrikaHealth(): Promise<number | null> {
  const { rows } = await adsQuery<{ t: Date | null }>(
    `SELECT MAX(checked_at) AS t FROM ads.health_check
     WHERE kind = 'api_metrika' AND ok = TRUE`
  );
  if (rows[0]?.t) {
    return (Date.now() - new Date(rows[0].t).getTime()) / 3600000;
  }
  // Fallback: source_snapshot metrika
  try {
    const snap = await adsQuery<{ t: Date | null }>(
      `SELECT fetched_at AS t FROM ads.source_snapshot
       WHERE source = 'metrika' AND ok = TRUE`
    );
    if (snap.rows[0]?.t) {
      return (Date.now() - new Date(snap.rows[0].t).getTime()) / 3600000;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function recordHealthCheck(input: {
  target: string;
  kind: "landing" | "api_direct" | "api_metrika" | "cron_freshness";
  statusCode?: number | null;
  latencyMs?: number | null;
  ok: boolean;
  detail?: unknown;
}): Promise<void> {
  await adsQuery(
    `INSERT INTO ads.health_check (target, kind, status_code, latency_ms, ok, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.target,
      input.kind,
      input.statusCode ?? null,
      input.latencyMs ?? null,
      input.ok,
      JSON.stringify(input.detail ?? null),
    ]
  );
}

export async function bumpSyncStatsFailStreak(ok: boolean): Promise<number> {
  if (ok) {
    await setConfigJson("guard.sync_stats_fail_streak", 0, "guard");
    return 0;
  }
  const prev = (await getConfigJson<number>("guard.sync_stats_fail_streak")) || 0;
  const next = prev + 1;
  await setConfigJson("guard.sync_stats_fail_streak", next, "guard");
  return next;
}

export async function runFreshnessGuard(): Promise<{
  action: "ok" | "warn" | "pause";
  statsHours: number | null;
  metrikaHours: number | null;
  failStreak: number;
}> {
  const { warnHours, stopHours } = await getStaleConfig();
  const statsHours = await hoursSinceLastDailyStats();
  const metrikaHours = await hoursSinceMetrikaHealth();
  const failStreak = (await getConfigJson<number>("guard.sync_stats_fail_streak")) || 0;

  await recordHealthCheck({
    target: "daily_stats",
    kind: "cron_freshness",
    ok: statsHours != null && statsHours <= stopHours,
    latencyMs: statsHours != null ? Math.round(statsHours * 3600000) : null,
    detail: { statsHours, metrikaHours, failStreak },
  });

  if (failStreak >= 3) {
    await safetyPauseAll({
      reason: "sync_stats",
      code: "B2_SYNC_STATS_FAIL",
      message: `ads-sync-stats упал ${failStreak} раза подряд`,
      severity: "critical",
    });
    return { action: "pause", statsHours, metrikaHours, failStreak };
  }

  if (
    (statsHours != null && statsHours > stopHours) ||
    (metrikaHours != null && metrikaHours > stopHours) ||
    (statsHours == null && metrikaHours == null)
  ) {
    // If both null and we have never synced — only pause if campaigns exist / spend > 0
    const spend = await adsQuery<{ s: string }>(
      `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats`
    );
    const hasSpend = Number(spend.rows[0]?.s || 0) > 0;
    if (hasSpend || (statsHours != null && statsHours > stopHours) || (metrikaHours != null && metrikaHours > stopHours)) {
      await safetyPauseAll({
        reason: "freshness",
        code: "B2_STALE_STOP",
        message: `Слепой полёт: stats=${statsHours?.toFixed(1) ?? "n/a"}ч metrika=${metrikaHours?.toFixed(1) ?? "n/a"}ч (stop>${stopHours}ч)`,
        severity: "critical",
      });
      return { action: "pause", statsHours, metrikaHours, failStreak };
    }
  }

  if (
    (statsHours != null && statsHours > warnHours) ||
    (metrikaHours != null && metrikaHours > warnHours)
  ) {
    await adsQuery(
      `INSERT INTO ads.alert (severity, code, message, payload_json)
       VALUES ('warning', 'B2_STALE_WARN', $1, $2::jsonb)`,
      [
        `Статистика устаревает: stats=${statsHours?.toFixed(1) ?? "n/a"}ч metrika=${metrikaHours?.toFixed(1) ?? "n/a"}ч`,
        JSON.stringify({ statsHours, metrikaHours, warnHours }),
      ]
    );
    return { action: "warn", statsHours, metrikaHours, failStreak };
  }

  return { action: "ok", statsHours, metrikaHours, failStreak };
}
