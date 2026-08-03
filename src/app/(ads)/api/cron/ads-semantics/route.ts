import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { runSemantics } from "@/modules/ads/semantics/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  const result = await runSemantics();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
