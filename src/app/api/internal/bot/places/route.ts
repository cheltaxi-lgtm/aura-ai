import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { assertBotInternalAuth } from "@/lib/telegram/bot-internal-auth";
import { searchBirthPlaces } from "@/lib/natal/geocode";

export const runtime = "nodejs";

/** Bot → site: birth-city suggestions for onboarding. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const limited = await enforcePaidRouteRateLimit(
    `bot-places:${clientIp(request)}`,
    "natal_places"
  );
  if (limited) {
    return NextResponse.json({ ok: false, error: "rate_limit" }, { status: 429 });
  }

  let body: { q?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 2) {
    return NextResponse.json({ ok: true, places: [] });
  }

  const limitRaw = typeof body.limit === "number" ? body.limit : 6;
  const limit = Math.min(8, Math.max(1, Math.floor(limitRaw)));

  try {
    const places = (await searchBirthPlaces(q, limit)).map((p) => ({
      label: p.label,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone,
    }));
    return NextResponse.json({ ok: true, places });
  } catch (err) {
    console.warn("[bot/places]", err);
    return NextResponse.json({ ok: true, places: [] });
  }
}
