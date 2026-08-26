import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { getCampaigns } from "@/modules/ads/direct/campaigns";
import { adsQuery } from "@/modules/ads/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-sync-entities", async () => {
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
    return { count: camps.length, units };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
