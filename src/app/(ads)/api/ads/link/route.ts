import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { ADS_CID_COOKIE, linkClickUser } from "@/modules/ads/attribution";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;

  const auth = await getAuth();
  if (!auth?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clickId = req.cookies.get(ADS_CID_COOKIE)?.value;
  if (!clickId || !/^[0-9a-f-]{36}$/i.test(clickId)) {
    return NextResponse.json({ ok: true, linked: false, reason: "no_cookie" });
  }

  // auth.sub is user_accounts.id — store as user_id without FK
  const inserted = await linkClickUser(clickId, auth.sub);
  return NextResponse.json({ ok: true, linked: inserted || true });
}
