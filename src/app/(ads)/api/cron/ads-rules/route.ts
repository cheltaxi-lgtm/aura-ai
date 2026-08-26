import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import {
  getBudget,
  rulesMode,
  isAdsRulesEnabled,
  canMutateDirect,
  getConfigJson,
  setConfigJson,
} from "@/modules/ads/config";
import { evaluateKillSwitch } from "@/modules/ads/rules/killswitch";
import {
  evaluateDiscoveryRules,
  discoveryExitCondition,
} from "@/modules/ads/rules/discovery";
import { adsQuery } from "@/modules/ads/db";
import { pauseCampaigns } from "@/modules/ads/direct/campaigns";
import { createApprovalRequest } from "@/modules/ads/approvals";
import {
  hoursSinceLastDailyStats,
  hoursSinceMetrikaHealth,
} from "@/modules/ads/guard/freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-rules", async () => {
    const budget = await getBudget();
    const mode = rulesMode();
    const rulesOn = await isAdsRulesEnabled();
    const mutateDirect = await canMutateDirect();

    const todayCost = await adsQuery<{ s: string }>(
      `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats WHERE date = CURRENT_DATE`
    );
    const totalCost = await adsQuery<{ s: string }>(
      `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats`
    );
    const funnel = await adsQuery<{
      clicks: number;
      deck_views: number;
      registrations: number;
      spread_submits: number;
    }>(
      `SELECT COALESCE(SUM(clicks),0)::int AS clicks,
              COALESCE(SUM(deck_views),0)::int AS deck_views,
              COALESCE(SUM(registrations),0)::int AS registrations,
              COALESCE(SUM(spread_submits),0)::int AS spread_submits
       FROM ads.funnel_daily WHERE date >= CURRENT_DATE - 1`
    );
    const regsTotal = await adsQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ads.conversion WHERE type='registration'`
    );

    const spendTodayRub = Number(todayCost.rows[0]?.s || 0);
    const spendTotalRub = Number(totalCost.rows[0]?.s || 0);
    const clicks24h = funnel.rows[0]?.clicks || 0;
    const deckViews24h = funnel.rows[0]?.deck_views || 0;
    const registrations24h = funnel.rows[0]?.registrations || 0;
    const spreadSubmitsTotal = funnel.rows[0]?.spread_submits || 0;
    const registrationsTotal = regsTotal.rows[0]?.n || 0;

    const statsStaleHours = (await hoursSinceLastDailyStats().catch(() => null)) ?? 0;
    const metrikaStaleHours = (await hoursSinceMetrikaHealth().catch(() => null)) ?? 0;

    const killCtx = {
      budget,
      spendTodayRub,
      spendTotalRub,
      clicks24h,
      registrations24h,
      statsStaleHours,
      metrikaStaleHours,
    };
    const discCtx = {
      budget,
      spendTodayRub,
      spendTotalRub,
      clicks24h,
      deckViews24h,
      spreadSubmitsTotal,
      registrationsTotal,
      cpaRegistrationRub: null as number | null,
    };

    const kills = evaluateKillSwitch(killCtx);
    const disc = rulesOn ? evaluateDiscoveryRules(discCtx) : [];
    const all = [...kills, ...disc];
    const pauseAll = all.some((r) => r.applyPause);
    const applied: string[] = [];

    for (const r of all) {
      await adsQuery(
        `INSERT INTO ads.rule_log (rule, decision, reason_json, applied)
         VALUES ($1,$2,$3::jsonb,$4)`,
        [
          r.rule,
          r.decision,
          JSON.stringify(r),
          mutateDirect && mode === "apply" && !!r.applyPause,
        ]
      );
      if (r.alert) {
        await adsQuery(
          `INSERT INTO ads.alert (severity, code, message, payload_json)
           VALUES ($1,$2,$3,$4::jsonb)`,
          [r.alert.severity, r.alert.code || r.rule, r.alert.message, JSON.stringify(r)]
        );
      }
    }

    if (pauseAll && mutateDirect) {
      const camps = await adsQuery<{ external_id: string }>(
        `SELECT external_id FROM ads.entity_snapshot WHERE level='campaign'`
      );
      const ids = camps.rows.map((c) => Number(c.external_id)).filter(Boolean);
      if (ids.length) {
        try {
          await pauseCampaigns(ids);
          applied.push(`paused:${ids.join(",")}`);
          if (all.some((r) => r.rule === "D1" && r.applyPause)) {
            const prev = (await getConfigJson<number[]>("guard.cpa_paused_ids")) || [];
            await setConfigJson(
              "guard.cpa_paused_ids",
              [...new Set([...prev, ...ids])],
              "ads-rules"
            );
            await adsQuery(
              `UPDATE ads.entity_snapshot
               SET pause_reason = 'cpa'
               WHERE level='campaign' AND external_id = ANY($1::text[])`,
              [ids.map(String)]
            );
          }
        } catch (e) {
          applied.push(`pause_failed:${e instanceof Error ? e.message : "err"}`);
        }
      }
    } else if (pauseAll && !mutateDirect) {
      applied.push("pause_skipped_write_disabled");
    }

    const exit = discoveryExitCondition({
      registrationsTotal,
      spendTotalRub,
      targetRegistrations: budget.discovery_target_registrations,
      totalBudgetRub: budget.discovery_total_budget_rub,
    });
    if (exit.triggered) {
      await createApprovalRequest({
        kind: exit.kind,
        currentValue: { mode: "discovery" },
        proposedValue: { mode: "scale_or_stop" },
        rationale: {
          registrations: registrationsTotal,
          spend: spendTotalRub,
          changeMode: exit.changeMode,
        },
      });
      applied.push("exit_approval_created");
    }

    let seo: Record<string, unknown> = {};
    try {
      const { evaluateSeoRules } = await import("@/modules/ads/organic/seo-rules");
      seo = await evaluateSeoRules();
    } catch (e) {
      seo = { error: e instanceof Error ? e.message : "seo_rules_failed" };
    }

    return { mode, rules: all.length, applied, mutateDirect, seo };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
