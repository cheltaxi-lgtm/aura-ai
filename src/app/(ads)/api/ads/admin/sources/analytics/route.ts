import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import {
  fetchMetrikaSnapshot,
  parsePeriodDays,
} from "@/modules/ads/sources/metrika";
import { fetchWebmasterSnapshot } from "@/modules/ads/sources/webmaster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live period analytics for Sources UI (Metrika + Webmaster).
 * GET /api/ads/admin/sources/analytics?days=7|14|30|90
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const days = parsePeriodDays(request.nextUrl.searchParams.get("days"));
  try {
    const [metrika, webmaster] = await Promise.all([
      fetchMetrikaSnapshot(days),
      fetchWebmasterSnapshot(),
    ]);
    return NextResponse.json({
      ok: true,
      days,
      fetchedAt: new Date().toISOString(),
      metrika,
      webmaster,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        days,
        error: e instanceof Error ? e.message : "analytics_failed",
      },
      { status: 502 }
    );
  }
}
