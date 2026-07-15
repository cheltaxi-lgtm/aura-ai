import { NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isCompatibilityId } from "@/lib/natal/compatibility-api";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  deleteCompatibilityRecord,
  getCompatibilityRecord,
} from "@/lib/services/natal-compatibility-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "natal_compatibility_read"
  );
  if (limited) return limited;
  const { id } = await params;
  if (!isCompatibilityId(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const record = await getCompatibilityRecord(id, auth.profileUserId);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ record });
}

export async function DELETE(_: Request, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "natal_compatibility_delete"
  );
  if (limited) return limited;
  const { id } = await params;
  if (!isCompatibilityId(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const deleted = await deleteCompatibilityRecord(id, auth.profileUserId);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ deleted: true, sharesRevoked: true });
}
