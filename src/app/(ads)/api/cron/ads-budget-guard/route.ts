import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { runBudgetGuard } from "@/modules/ads/guard/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every 15 minutes — B1 hard budget. Independent of rules flags. */
export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-budget-guard", async () => {
    return runBudgetGuard() as Promise<Record<string, unknown>>;
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
