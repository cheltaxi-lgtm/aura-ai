import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { fetchCustomReport } from "@/modules/ads/direct/reports";
import { adsQuery } from "@/modules/ads/db";
import { setConfigJson } from "@/modules/ads/config";
import { bumpSyncStatsFailStreak } from "@/modules/ads/guard/freshness";
import { safetyPauseAll } from "@/modules/ads/guard/pause-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;

  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  try {
    const { csv, units } = await fetchCustomReport({
      dateFrom: day,
      dateTo: day,
      fieldNames: [
        "Date",
        "CampaignId",
        "AdGroupId",
        "CriterionId",
        "Impressions",
        "Clicks",
        "Cost",
      ],
    });
    let rows = 0;
    for (const line of csv.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("Date")) continue;
      const p = line.split("\t");
      if (p.length < 7) continue;
      await adsQuery(
        `INSERT INTO ads.daily_stats
          (date, campaign_id, adgroup_id, criterion_id, impressions, clicks, cost_rub)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (date, campaign_id, adgroup_id, criterion_id) DO UPDATE SET
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           cost_rub = EXCLUDED.cost_rub`,
        [
          p[0],
          Number(p[1]) || 0,
          Number(p[2]) || 0,
          Number(p[3]) || 0,
          Number(p[4]) || 0,
          Number(p[5]) || 0,
          Number(String(p[6]).replace(",", ".")) || 0,
        ]
      );
      rows++;
    }
    await bumpSyncStatsFailStreak(true);
    await setConfigJson("guard.last_stats_sync_at", new Date().toISOString(), "cron");
    return NextResponse.json({ ok: true, day, rows, units });
  } catch (e) {
    const failStreak = await bumpSyncStatsFailStreak(false);
    if (failStreak >= 3) {
      try {
        await safetyPauseAll({
          reason: "sync_stats",
          code: "B2_SYNC_STATS_FAIL",
          message: `ads-sync-stats упал ${failStreak} раза подряд`,
          severity: "critical",
        });
      } catch {
        /* ignore secondary */
      }
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error", failStreak },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
