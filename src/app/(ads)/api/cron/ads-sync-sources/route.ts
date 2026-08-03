import { NextRequest, NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { canAccessAdsAdmin } from "@/modules/ads/config";
import { syncAllSources } from "@/modules/ads/sources/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  if (!(await canAccessAdsAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const result = await syncAllSources();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sync_failed" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
