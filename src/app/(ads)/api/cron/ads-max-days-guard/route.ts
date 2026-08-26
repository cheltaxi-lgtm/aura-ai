import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runMaxDaysGuard } from "@/modules/ads/guard/max-days";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily — B6 forgotten test. */
export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-max-days-guard", async () => {
    return runMaxDaysGuard() as Promise<Record<string, unknown>>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
