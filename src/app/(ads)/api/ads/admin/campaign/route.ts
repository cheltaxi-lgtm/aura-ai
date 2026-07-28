import { NextRequest, NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { pauseCampaigns, resumeCampaigns } from "@/modules/ads/direct/campaigns";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const { rows } = await adsQuery<{
    external_id: string;
    name: string | null;
    status: string | null;
    moderation_status: string | null;
    daily_budget_rub: string | null;
    strategy_mode: string | null;
    synced_at: Date;
  }>(
    `SELECT external_id, name, status, moderation_status, daily_budget_rub,
            strategy_mode, synced_at
     FROM ads.entity_snapshot
     WHERE level = 'campaign'
     ORDER BY synced_at DESC
     LIMIT 50`
  );

  const campaigns = await Promise.all(
    rows.map(async (c) => {
      const id = Number(c.external_id);
      const stats = await adsQuery<{ cost: string; clicks: string }>(
        `SELECT COALESCE(SUM(cost_rub),0)::text AS cost,
                COALESCE(SUM(clicks),0)::text AS clicks
         FROM ads.daily_stats WHERE campaign_id = $1`,
        [id || 0]
      );
      const regs = await adsQuery<{ n: string }>(
        `SELECT COALESCE(SUM(registrations),0)::text AS n
         FROM ads.funnel_daily WHERE campaign_id = $1`,
        [id || 0]
      );
      const cost = Number(stats.rows[0]?.cost || 0);
      const regN = Number(regs.rows[0]?.n || 0);
      return {
        id: c.external_id,
        name: c.name,
        status: c.status,
        moderationStatus: c.moderation_status,
        strategyMode: c.strategy_mode,
        dailyBudgetRub: c.daily_budget_rub != null ? Number(c.daily_budget_rub) : null,
        spent: cost,
        clicks: Number(stats.rows[0]?.clicks || 0),
        registrations: regN,
        cpaRegistration: regN > 0 ? cost / regN : null,
        syncedAt: c.synced_at,
      };
    })
  );

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: (number | string)[];
  };
  const action = body.action === "resume" ? "resume" : body.action === "pause" ? "pause" : null;
  if (!action) {
    return NextResponse.json({ error: "action_required" }, { status: 400 });
  }

  let ids = (body.ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    const camps = await adsQuery<{ external_id: string }>(
      `SELECT external_id FROM ads.entity_snapshot WHERE level='campaign'`
    );
    ids = camps.rows.map((c) => Number(c.external_id)).filter(Boolean);
  }

  let result: unknown = { ids };
  try {
    result =
      action === "pause" ? await pauseCampaigns(ids) : await resumeCampaigns(ids);
    const status = action === "pause" ? "SUSPENDED" : "ON";
    if (ids.length) {
      await adsQuery(
        `UPDATE ads.entity_snapshot SET status = $1, synced_at = NOW()
         WHERE level = 'campaign' AND external_id = ANY($2::text[])`,
        [status, ids.map(String)]
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "direct_error";
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: `campaign_${action}_failed`,
      payload: { ids },
      result: { error: msg },
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await writeAdsAdminAction({
    adminId: auth.sub,
    action: `campaign_${action}`,
    payload: { ids },
    result,
    entityType: "ads_campaign",
  });

  return NextResponse.json({ ok: true, action, ids });
}
