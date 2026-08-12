import { NextRequest, NextResponse } from "next/server";
import { searchBirthPlaces } from "@/lib/natal/geocode";
import { isNatalChartEnabled } from "@/lib/settings";
import { getAuth } from "@/lib/auth";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

/**
 * Place search for Natal. Authenticated: paid-route RL.
 * Guest (public calculator): IP RL — same geocode stack as HD places.
 */
export async function GET(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ places: [] });
  }

  const auth = await getAuth();
  if (auth?.role === "user") {
    const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "natal_places");
    if (rateLimited) return rateLimited;
  } else {
    const { allowed } = await checkRateLimit(
      rateLimitKey("natal_places_guest", clientIp(request)),
      60,
      60_000
    );
    if (!allowed) {
      return NextResponse.json({ error: "rate_limit" }, { status: 429 });
    }
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await searchBirthPlaces(q, 8);
    return NextResponse.json({ places });
  } catch (error) {
    console.warn("[natal-chart] geocode search failed:", error);
    return NextResponse.json({ places: [] });
  }
}
