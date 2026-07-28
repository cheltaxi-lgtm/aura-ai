import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { rollupFunnelDaily } from "@/modules/ads/funnel-rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  const n = await rollupFunnelDaily();
  return NextResponse.json({ ok: true, rows: n });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
