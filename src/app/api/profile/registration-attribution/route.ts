import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { saveRegistrationAttributionIfEmpty } from "@/lib/accounts";
import { sanitizeRegistrationAttribution } from "@/lib/registration-attribution";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

/** Persist first-touch UTM once (email register embeds it; OAuth uses this after login). */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforcePaidRouteRateLimit(auth.sub, "registration_attribution");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const attribution = sanitizeRegistrationAttribution(
    (body as { attribution?: unknown })?.attribution ?? body
  );
  if (!attribution) {
    return NextResponse.json({ ok: true, saved: false, reason: "empty" });
  }

  const saved = await saveRegistrationAttributionIfEmpty(auth.sub, attribution as Record<string, string>);
  return NextResponse.json({ ok: true, saved });
}
