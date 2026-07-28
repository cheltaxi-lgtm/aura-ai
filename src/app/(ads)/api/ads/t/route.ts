import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import {
  ADS_CID_COOKIE,
  ADS_CID_TTL_SEC,
  createClick,
  hashVisitor,
} from "@/modules/ads/attribution";
import { rateLimitIp } from "@/modules/ads/rate-limit";

export const runtime = "nodejs";

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

  const rl = rateLimitIp(clientIp(req), 60);
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

  const landing =
    typeof body.landing_path === "string" && body.landing_path.startsWith("/")
      ? body.landing_path.slice(0, 500)
      : "/";
  const str = (k: string) =>
    typeof body[k] === "string" ? String(body[k]).slice(0, 500) : null;

  const visitor = hashVisitor(`${clientIp(req)}|${req.headers.get("user-agent") || ""}`);
  const id = await createClick({
    yclid: str("yclid"),
    utm_source: str("utm_source"),
    utm_medium: str("utm_medium"),
    utm_campaign: str("utm_campaign"),
    utm_content: str("utm_content"),
    utm_term: str("utm_term"),
    landing_path: landing,
    visitor_hash: visitor,
  });

  const res = NextResponse.json({ ok: true, id });
  res.cookies.set(ADS_CID_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADS_CID_TTL_SEC,
  });
  return res;
}
