import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { computeEconomics } from "@/modules/ads/economics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-economics", async () => {
    const snap = await computeEconomics();
    return { snap } as Record<string, unknown>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
