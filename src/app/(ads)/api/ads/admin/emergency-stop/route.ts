import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { setConfigJson } from "@/modules/ads/config";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";
import { safetyPauseAll } from "@/modules/ads/guard/pause-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * B7 — emergency stop: pause all + ads.enabled=false.
 * Admin role only (403 without). Available even if ads.observe is off.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let paused: number[] = [];
  let pauseError: string | null = null;
  try {
    const r = await safetyPauseAll({
      reason: "emergency",
      code: "B7_EMERGENCY_STOP",
      message: "Аварийная остановка администратором",
      severity: "critical",
    });
    paused = r.paused;
  } catch (e) {
    pauseError = e instanceof Error ? e.message : "pause_failed";
  }

  try {
    await setConfigJson("ads.enabled", false, auth.sub);
  } catch (e) {
    pauseError =
      (pauseError ? pauseError + "; " : "") +
      (e instanceof Error ? e.message : "disable_failed");
  }

  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "emergency_stop",
    payload: { paused },
    result: { pauseError, adsEnabled: false },
    entityType: "ads_emergency",
  });

  if (pauseError) {
    return NextResponse.json(
      { ok: false, error: pauseError, paused, adsEnabled: false },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, paused, adsEnabled: false });
}
