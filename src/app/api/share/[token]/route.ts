import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { ensureDb } from "@/lib/db";
import { getShareSnapshotByToken } from "@/lib/share";
import { toSharePublicApiResponse } from "@/lib/share/public-payload";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const limited = await enforcePaidRouteRateLimit(clientIp(request), "share_public");
  if (limited) return limited;

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const { token } = await context.params;
  if (!token || token.length > 32) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const snapshot = await getShareSnapshotByToken(token, false);
  if (!snapshot) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(toSharePublicApiResponse(snapshot));
}
