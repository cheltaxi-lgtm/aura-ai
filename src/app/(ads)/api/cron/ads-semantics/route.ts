import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runSemantics } from "@/modules/ads/semantics/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-semantics", async () => {
    return runSemantics() as Promise<Record<string, unknown>>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
