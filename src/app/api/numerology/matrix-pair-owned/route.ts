import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { hasOwnedMatrixPairForPending, ownedMatrixPairReportForPending } from "@/lib/numerology/matrix-pair-ownership";
import { requireProfileUserId } from "@/lib/require-auth";

export const runtime = "nodejs";

/** Exact current-pair ownership plus the owner's printable report ID. */
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
    const report = owned ? await ownedMatrixPairReportForPending(auth.profileUserId, pendingId) : null;
    return NextResponse.json({ owned, reportId: report?.id ?? null });
  } catch {
    console.warn("[matrix-pair] ownership lookup failed");
    return NextResponse.json({ owned: false });
  }
}
