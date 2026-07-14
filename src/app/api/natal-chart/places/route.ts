import { NextRequest, NextResponse } from "next/server";
import { searchBirthPlaces } from "@/lib/natal/geocode";
import { isNatalChartEnabled } from "@/lib/settings";
import { requireUserAuth } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

export async function GET(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ places: [] });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "natal_places");
  if (rateLimited) return rateLimited;

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
