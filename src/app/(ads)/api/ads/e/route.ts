import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { ADS_CID_COOKIE, recordMicroConversion } from "@/modules/ads/attribution";
import { rateLimitIp } from "@/modules/ads/rate-limit";
import type { MicroConversionType } from "@/modules/ads/types";

export const runtime = "nodejs";

const ALLOWED = new Set<MicroConversionType>([
  "deck_view",
  "card_pick",
  "spread_submit",
  "teaser_view",
]);

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;

  const rl = rateLimitIp(`e:${clientIp(req)}`, 120);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = body.type as MicroConversionType;
  if (!ALLOWED.has(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const clickId =
    req.cookies.get(ADS_CID_COOKIE)?.value ||
    (typeof body.click_id === "string" ? body.click_id : "");
  if (!clickId || !/^[0-9a-f-]{36}$/i.test(clickId)) {
    return NextResponse.json({ error: "no_click" }, { status: 400 });
  }

  const result = await recordMicroConversion(clickId, type);
  if (result === "missing_click") {
    return NextResponse.json({ error: "missing_click" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, result });
}
