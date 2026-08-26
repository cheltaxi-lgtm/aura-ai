import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runLandingGuard } from "@/modules/ads/guard/landing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly — B3 landing healthcheck. */
export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-landing-check", async () => {
    return runLandingGuard() as Promise<Record<string, unknown>>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
