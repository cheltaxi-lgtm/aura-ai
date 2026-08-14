import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { hasOwnedNatalInterpretationForArtifact } from "@/lib/natal/interpretation-ownership";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";

export const runtime = "nodejs";

/** Exact current-artifact Natal interpretation ownership. Body is { owned } only. */
export async function GET(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_history");
  if (limited) return limited;

  const artifactId = request.nextUrl.searchParams.get("artifactId") ?? "";

  try {
    const owned = await hasOwnedNatalInterpretationForArtifact({
      userId: auth.profileUserId,
      artifactId,
    });
    return NextResponse.json({ owned });
  } catch {
    console.warn("[natal-chart] interpretation ownership lookup failed");
    return NextResponse.json({ owned: false });
  }
}
