import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { uploadOfflineConversions } from "@/modules/ads/offline-conversions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-offline-conversions", async () => {
    const result = await uploadOfflineConversions();
    return result as Record<string, unknown>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
