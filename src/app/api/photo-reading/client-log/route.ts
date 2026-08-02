import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/api-guards";
import { requireUserAuth } from "@/lib/require-auth";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 4_096;

/**
 * Client-side error breadcrumbs for photo recognize debugging.
 * Deliberately does NOT require auth: the camera/upload button is reachable
 * before login, and a diagnostic breadcrumb is more useful landing as
 * "anonymous" than being silently dropped with a 401.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const { allowed } = await checkRateLimit(
    rateLimitKey("photo_client_log", ip),
    40,
    60_000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const auth = await requireUserAuth();

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    console.error("[photo-recognize-client]", {
      userId: auth?.sub ?? "anonymous",
      phase: body.phase,
      error: body.error,
      bytes: body.bytes,
      blobBytes: body.blobBytes,
      originalBytes: body.originalBytes,
      name: body.name,
      source: body.source,
      transport: body.transport,
    });
  } catch {
    console.error("[photo-recognize-client] invalid payload", {
      userId: auth?.sub ?? "anonymous",
    });
  }

  return NextResponse.json({ ok: true });
}
