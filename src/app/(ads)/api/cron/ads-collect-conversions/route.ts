import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { collectServerConversions } from "@/modules/ads/collect-conversions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-collect-conversions", async () => {
    const counts = await collectServerConversions(7);
    return { counts };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
