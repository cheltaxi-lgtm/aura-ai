import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { rollupFunnelDaily } from "@/modules/ads/funnel-rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-funnel-rollup", async () => {
    const n = await rollupFunnelDaily();
    return { rows: n };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
