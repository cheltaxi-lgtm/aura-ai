import { NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { pauseCampaigns } from "@/modules/ads/direct/campaigns";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Emergency stop: pause all campaigns + critical alert. */
export async function POST() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const camps = await adsQuery<{ external_id: string }>(
    `SELECT external_id FROM ads.entity_snapshot
     WHERE level='campaign' AND COALESCE(status,'') != 'SUSPENDED'`
  );
  const ids = camps.rows.map((c) => Number(c.external_id)).filter(Boolean);

  let pauseError: string | null = null;
  if (ids.length) {
    try {
      await pauseCampaigns(ids);
      await adsQuery(
        `UPDATE ads.entity_snapshot SET status = 'SUSPENDED', synced_at = NOW()
         WHERE level = 'campaign' AND external_id = ANY($1::text[])`,
        [ids.map(String)]
      );
    } catch (e) {
      pauseError = e instanceof Error ? e.message : "pause_failed";
    }
  }

  await adsQuery(
    `INSERT INTO ads.alert (severity, code, message, payload_json)
     VALUES ('critical', 'ADMIN_STOP_ALL', $1, $2::jsonb)`,
    [
      "Админ остановил всю рекламу",
      JSON.stringify({ ids, by: auth.sub, pauseError }),
    ]
  );

  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "stop_all",
    payload: { ids },
    result: { pauseError },
    entityType: "ads_campaign",
  });

  if (pauseError) {
    return NextResponse.json(
      { ok: false, error: pauseError, ids, alert: true },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, paused: ids, alert: true });
}
