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
  const [metrikaR, webmasterR] = await Promise.allSettled([
    fetchMetrikaSnapshot(days),
    fetchWebmasterSnapshot(),
  ]);
  const metrika = metrikaR.status === "fulfilled" ? metrikaR.value : null;
  const webmaster = webmasterR.status === "fulfilled" ? webmasterR.value : null;
  const metrikaError =
    metrikaR.status === "rejected"
      ? metrikaR.reason instanceof Error
        ? metrikaR.reason.message
        : String(metrikaR.reason)
      : null;
  const webmasterError =
    webmasterR.status === "rejected"
      ? webmasterR.reason instanceof Error
        ? webmasterR.reason.message
        : String(webmasterR.reason)
      : null;

  return NextResponse.json({
    ok: Boolean(metrika || webmaster),
    days,
    fetchedAt: new Date().toISOString(),
    metrika,
    webmaster,
    metrikaError,
    webmasterError,
    error: !metrika && !webmaster ? metrikaError || webmasterError || "analytics_failed" : null,
  });
}
