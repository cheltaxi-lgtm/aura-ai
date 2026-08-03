import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";
import {
  loadWordstatDashboard,
  syncWordstatSource,
} from "@/modules/ads/sources/wordstat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Wordstat report can take up to ~90s */
export const maxDuration = 120;

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const dashboard = await loadWordstatDashboard();
  return NextResponse.json({
    ok: true,
    ...dashboard,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;
  const body = (await req.json().catch(() => ({}))) as { refresh?: boolean };
  if (body.refresh === false) {
    return NextResponse.json({ ok: true });
  }
  const result = await syncWordstatSource({ force: true });
  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "wordstat_refresh",
    payload: result,
    entityType: "ads_wordstat",
  });
  const dashboard = await loadWordstatDashboard();
  return NextResponse.json(
    { ok: result.ok, result, ...dashboard },
    { status: result.ok ? 200 : 502 }
  );
}
