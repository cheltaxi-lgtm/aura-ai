import { NextRequest, NextResponse } from "next/server";
import { searchBirthPlaces } from "@/lib/natal/geocode";
import { isHumanDesignEnabled } from "@/lib/settings";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ places: [] });
  }

  const { allowed } = await checkRateLimit(
    rateLimitKey("hd_places", clientIp(request)),
    60,
    60_000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await searchBirthPlaces(q, 8);
    return NextResponse.json({ places });
  } catch {
    console.warn("[human-design] geocode search failed");
    return NextResponse.json({ places: [] });
  }
}
