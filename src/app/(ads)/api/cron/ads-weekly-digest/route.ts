import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runWeeklyDigest } from "@/modules/ads/guard/digest";
import { runMaxDaysGuard } from "@/modules/ads/guard/max-days";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Weekly — B6 digest + max-days check. */
export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-weekly-digest", async () => {
    const maxDays = await runMaxDaysGuard();
    const digest = await runWeeklyDigest();
    return { maxDays, digest } as Record<string, unknown>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
