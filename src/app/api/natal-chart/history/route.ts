import { NextRequest, NextResponse } from "next/server";

import { requireProfileUserId } from "@/lib/require-auth";
import { listCurrentUserNatalReportHistory } from "@/lib/services/natal-chart-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isNatalChartEnabled } from "@/lib/settings";

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

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;

  try {
    const reports = await listCurrentUserNatalReportHistory(auth.profileUserId, limit);
    return NextResponse.json({ reports });
  } catch {
    console.warn("[natal-chart] report history unavailable");
    return NextResponse.json(
      { error: "Не удалось загрузить историю натальных отчётов." },
      { status: 500 }
    );
  }
}
