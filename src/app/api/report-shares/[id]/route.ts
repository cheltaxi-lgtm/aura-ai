import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: RouteParams) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "report_share_manage");
  if (limited) return limited;
  const { id } = await params;
  const result = await query(
    `UPDATE private_report_shares SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id = $1 AND owner_user_id = $2`,
    [id, auth.profileUserId]
  );
  if (!result.rowCount) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ revoked: true });
}
