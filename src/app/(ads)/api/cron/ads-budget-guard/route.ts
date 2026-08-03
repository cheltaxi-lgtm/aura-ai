import { NextRequest, NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { canAccessAdsAdmin } from "@/modules/ads/config";
import { runBudgetGuard } from "@/modules/ads/guard/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every 15 minutes — B1 hard budget. Independent of rules flags. */
export async function POST(request: NextRequest) {
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  if (!(await canAccessAdsAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const result = await runBudgetGuard();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "budget_guard_failed" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
