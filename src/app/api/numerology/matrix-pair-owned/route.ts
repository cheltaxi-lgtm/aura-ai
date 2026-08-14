import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { hasOwnedMatrixPairForPending } from "@/lib/numerology/matrix-pair-ownership";
import { requireProfileUserId } from "@/lib/require-auth";

export const runtime = "nodejs";

/** Exact current-pair MATRIX_PAIR_REPORT ownership. Body is { owned } only. */
export async function GET(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report"
  );
  if (limited) return limited;

  const pendingId = request.nextUrl.searchParams.get("pendingId") ?? "";

  try {
    const owned = await hasOwnedMatrixPairForPending({
      userId: auth.profileUserId,
      pendingId,
    });
    return NextResponse.json({ owned });
  } catch {
    console.warn("[matrix-pair] ownership lookup failed");
    return NextResponse.json({ owned: false });
  }
}
