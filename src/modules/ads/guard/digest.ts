/**
 * B6 — weekly digest via existing createNotification (in-app).
 */
import { adsQuery } from "../db";
import { adsReadOnlyPublic } from "../db";
import { getHardBudgetConfig, sumLedgerAndStats } from "./budget";
import { createNotification } from "@/lib/ritual-service";

export async function buildWeeklyDigestText(): Promise<string> {
  const { hardTotalRub } = await getHardBudgetConfig();
  let spent = 0;
  try {
    spent = (await sumLedgerAndStats()).spentRub;
  } catch {
    spent = 0;
  }
  const remain = Math.max(0, hardTotalRub - spent);
  const last7 = await adsQuery<{ s: string }>(
    `SELECT COALESCE(SUM(cost_rub),0)::text AS s
     FROM ads.daily_stats WHERE date >= CURRENT_DATE - 7`
  );
  const weekSpend = Number(last7.rows[0]?.s || 0);
  const dailyPace = weekSpend / 7;
  const daysLeft = dailyPace > 0 ? remain / dailyPace : null;

  const funnel = await adsQuery<{
    clicks: number;
    registrations: number;
    deck_views: number;
    spread_submits: number;
  }>(
    `SELECT COALESCE(SUM(clicks),0)::int AS clicks,
            COALESCE(SUM(registrations),0)::int AS registrations,
            COALESCE(SUM(deck_views),0)::int AS deck_views,
            COALESCE(SUM(spread_submits),0)::int AS spread_submits
     FROM ads.funnel_daily WHERE date >= CURRENT_DATE - 7`
  );
  const f = funnel.rows[0];
  const regs = f?.registrations || 0;
  const cpa = regs > 0 ? spent / regs : null;

  const steps = [
    { k: "deck", v: f?.deck_views || 0, prev: f?.clicks || 0 },
    { k: "spread", v: f?.spread_submits || 0, prev: f?.deck_views || 0 },
    { k: "reg", v: regs, prev: f?.spread_submits || 0 },
  ];
  let worst = "—";
  let worstCr = Infinity;
  for (const s of steps) {
    if (s.prev > 0) {
      const cr = s.v / s.prev;
      if (cr < worstCr) {
        worstCr = cr;
        worst = s.k;
      }
    }
  }

  return [
    `Ads weekly: потрачено ${Math.round(spent)} ₽ / лимит ${hardTotalRub} ₽`,
    `остаток ${Math.round(remain)} ₽` +
      (daysLeft != null ? ` (~${Math.round(daysLeft)} дн. при темпе)` : ""),
    `7д: клики ${f?.clicks || 0}, регистрации ${regs}, CPA ${cpa != null ? Math.round(cpa) : "—"} ₽`,
    `худший шаг воронки: ${worst}`,
  ].join("\n");
}

export async function runWeeklyDigest(): Promise<{ notified: number }> {
  const body = await buildWeeklyDigestText();
  let admins: { id: string }[] = [];
  try {
    // notifications.user_id references profile users.id, not user_accounts.id.
    const r = await adsReadOnlyPublic<{ id: string }>(
      `SELECT profile_user_id::text AS id
       FROM user_accounts
       WHERE role = 'admin' AND profile_user_id IS NOT NULL
       LIMIT 20`
    );
    admins = r.rows;
  } catch {
    admins = [];
  }

  let notified = 0;
  for (const a of admins) {
    try {
      await createNotification({
        userId: a.id,
        type: "ads_weekly_digest",
        title: "Ads Autopilot — недельный дайджест",
        body,
        data: { ctaPath: "/admin/ads" },
      });
      notified++;
    } catch {
      /* skip */
    }
  }

  await adsQuery(
    `INSERT INTO ads.alert (severity, code, message, payload_json)
     VALUES ('info', 'B6_WEEKLY_DIGEST', $1, $2::jsonb)`,
    [body.slice(0, 500), JSON.stringify({ notified })]
  );
  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ('guard', 'weekly_digest', '{}'::jsonb, $1::jsonb)`,
    [JSON.stringify({ notified })]
  );
  return { notified };
}
