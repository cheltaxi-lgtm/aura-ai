import { NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { listCompatibilityRecords } from "@/lib/services/natal-compatibility-service";

export async function GET() {
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
  const compatibility = await listCompatibilityRecords(auth.profileUserId);
  return NextResponse.json({ compatibility });
}
