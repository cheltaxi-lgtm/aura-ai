/**
 * B3 — landing HTTP healthcheck.
 */
import { getWhitelistPaths } from "../validator";
import { getConfigJson } from "../config";
import { recordHealthCheck } from "./freshness";
import { adsQuery } from "../db";
import { resumeLandingPaused, safetyPauseAll } from "./pause-all";

const BASE = "https://zovus.ru";

/** Consecutive OK counts per landing path (in-memory + config). */
async function getOkStreak(): Promise<Record<string, number>> {
  return (await getConfigJson<Record<string, number>>("guard.landing_ok_streak")) || {};
}

async function setOkStreak(map: Record<string, number>) {
  const { setConfigJson } = await import("../config");
  await setConfigJson("guard.landing_ok_streak", map, "guard");
}

export async function checkLanding(path: string, timeoutMs: number): Promise<{
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
}> {
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "ZovusAdsLandingCheck/1.0" },
    });
    const latencyMs = Date.now() - started;
    const ok = res.status === 200 && latencyMs <= timeoutMs;
    return { ok, statusCode: res.status, latencyMs };
  } catch {
    return { ok: false, statusCode: null, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function campaignsForLanding(path: string): Promise<number[]> {
  const slug = path.replace(/^\//, "");
  const { rows } = await adsQuery<{ external_id: string }>(
    `SELECT external_id FROM ads.entity_snapshot
     WHERE level = 'campaign'
       AND (name ILIKE '%' || $1 || '%' OR name ILIKE '%' || $2 || '%')`,
    [path, slug]
  );
  // If we can't map, pause all discovery campaigns (safe default)
  if (!rows.length) {
    const all = await adsQuery<{ external_id: string }>(
      `SELECT external_id FROM ads.entity_snapshot WHERE level='campaign'`
    );
    return all.rows.map((r) => Number(r.external_id)).filter(Boolean);
  }
  return rows.map((r) => Number(r.external_id)).filter(Boolean);
}

export async function runLandingGuard(): Promise<{
  checked: number;
  failed: string[];
  resumed: number[];
}> {
  const timeout =
    (await getConfigJson<number>("landing_timeout_ms")) || 5000;
  const paths = getWhitelistPaths();
  const failed: string[] = [];
  const streak = await getOkStreak();
  let resumed: number[] = [];

  for (const path of paths) {
    const r = await checkLanding(path, timeout);
    await recordHealthCheck({
      target: path,
      kind: "landing",
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      ok: r.ok,
    });
    if (!r.ok) {
      failed.push(path);
      streak[path] = 0;
      const ids = await campaignsForLanding(path);
      await safetyPauseAll({
        reason: "landing",
        code: "B3_LANDING_DOWN",
        message: `Посадочная ${path} недоступна (HTTP ${r.statusCode ?? "err"}, ${r.latencyMs}ms)`,
        severity: "critical",
        campaignIds: ids,
      });
    } else {
      streak[path] = (streak[path] || 0) + 1;
    }
  }

  // Two consecutive OK on all previously failed → resume landing-paused only
  const allOkTwice = paths.length > 0 && paths.every((p) => (streak[p] || 0) >= 2);
  if (allOkTwice && failed.length === 0) {
    const res = await resumeLandingPaused();
    resumed = res.resumed;
  }

  await setOkStreak(streak);
  return { checked: paths.length, failed, resumed };
}
