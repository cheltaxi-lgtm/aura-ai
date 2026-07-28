import { NextResponse } from "next/server";
import { getBudget, rulesMode } from "@/modules/ads/config";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const budget = await getBudget();
  const { rows } = await adsQuery(
    `SELECT id, rule, target_level, target_id, decision, reason_json,
            applied, created_at
     FROM ads.rule_log
     ORDER BY created_at DESC
     LIMIT 200`
  );

  return NextResponse.json({
    rulesMode: rulesMode(),
    thresholds: {
      discovery_daily_cap_rub: budget.discovery_daily_cap_rub,
      discovery_max_cpa_reg_rub: budget.discovery_max_cpa_reg_rub,
      global_daily_cap_rub: budget.global_daily_cap_rub,
      cpa_reg_kill_rub: budget.cpa_reg_kill_rub,
      ctr_min: budget.ctr_min,
      negative_min_clicks: budget.negative_min_clicks,
      rules_window_days: budget.rules_window_days,
      min_clicks_per_entity: budget.min_clicks_per_entity,
    },
    items: rows,
  });
}
