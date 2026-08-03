import { NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { getConfigJson } from "@/modules/ads/config";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { getHardBudgetConfig, sumLedgerAndStats } from "@/modules/ads/guard/budget";
import {
  hoursSinceLastDailyStats,
  hoursSinceMetrikaHealth,
} from "@/modules/ads/guard/freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  let checks: unknown[] = [];
  try {
    const { rows } = await adsQuery(
      `SELECT DISTINCT ON (kind, target)
         id, target, kind, status_code, latency_ms, ok, checked_at, detail_json
       FROM ads.health_check
       ORDER BY kind, target, checked_at DESC
       LIMIT 80`
    );
    checks = rows;
  } catch {
    checks = [];
  }

  const protection =
    (await getConfigJson<Record<string, unknown>>("guard.protection_status")) || {};
  const failStreak =
    (await getConfigJson<number>("guard.sync_stats_fail_streak")) || 0;
  const landingPaused =
    (await getConfigJson<number[]>("guard.landing_paused_ids")) || [];
  const cpaPaused = (await getConfigJson<number[]>("guard.cpa_paused_ids")) || [];

  let budget = { spentRub: 0, hardTotalRub: 9000, pct: 0 };
  try {
    const h = await getHardBudgetConfig();
    const s = await sumLedgerAndStats();
    budget = {
      spentRub: s.spentRub,
      hardTotalRub: h.hardTotalRub,
      pct: h.hardTotalRub > 0 ? (s.spentRub / h.hardTotalRub) * 100 : 0,
    };
  } catch {
    /* 086 */
  }

  return NextResponse.json({
    checks,
    statsHours: await hoursSinceLastDailyStats().catch(() => null),
    metrikaHours: await hoursSinceMetrikaHealth().catch(() => null),
    failStreak,
    landingPaused,
    cpaPaused,
    protection,
    budget,
    guards: {
      B1_budget: protection.budget_hard ? "fired" : "active",
      B2_freshness: protection.freshness || protection.sync_stats ? "fired" : "active",
      B3_landing: protection.landing ? "fired" : "active",
      B4_validator: "active",
      B5_approvals: "active",
      B6_max_days: protection.max_days ? "fired" : "active",
      B7_emergency: protection.emergency ? "fired" : "active",
    },
  });
}
