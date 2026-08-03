import { NextRequest, NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { canAccessAdsAdmin } from "@/modules/ads/config";
import { runWeeklyDigest } from "@/modules/ads/guard/digest";
import { runMaxDaysGuard } from "@/modules/ads/guard/max-days";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Weekly — B6 digest + max-days check. */
export async function POST(request: NextRequest) {
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  if (!(await canAccessAdsAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const maxDays = await runMaxDaysGuard();
    const digest = await runWeeklyDigest();
    return NextResponse.json({ ok: true, maxDays, digest });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "digest_failed" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
