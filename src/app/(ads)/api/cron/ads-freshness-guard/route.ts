import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runFreshnessGuard } from "@/modules/ads/guard/freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly — B2 blind-flight. Independent of rules flags. */
export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-freshness-guard", async () => {
    return runFreshnessGuard() as Promise<Record<string, unknown>>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
