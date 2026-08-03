import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { getCampaigns } from "@/modules/ads/direct/campaigns";
import { adsQuery } from "@/modules/ads/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;

  try {
    const { result, units } = await getCampaigns();
    const camps = result?.Campaigns || [];
    for (const c of camps) {
      await adsQuery(
        `INSERT INTO ads.entity_snapshot
          (level, external_id, name, status, moderation_status, synced_at)
         VALUES ('campaign', $1, $2, $3, $4, NOW())
         ON CONFLICT (level, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           moderation_status = EXCLUDED.moderation_status,
           synced_at = NOW()`,
        [String(c.Id), c.Name, c.State, c.Status]
      );
    }
    return NextResponse.json({ ok: true, count: camps.length, units });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
