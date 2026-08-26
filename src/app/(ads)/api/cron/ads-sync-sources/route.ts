import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { syncAllSources } from "@/modules/ads/sources/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-sync-sources", async () => {
    return syncAllSources();
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
