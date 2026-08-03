import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 8_192;

/**
 * Dev-only diagnostic sink. Never writes to disk; never enabled in production
 * even if DEBUG_CLIENT_LOG is set (use server logs / Sentry instead).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = clientIp(request);
  const { allowed } = await checkRateLimit(rateLimitKey("debug_client_log", ip), 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    console.info(
      JSON.stringify({
        type: "debug_client_log",
        ip,
        keys: Object.keys(body).slice(0, 20),
        ts: Date.now(),
      })
    );
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
