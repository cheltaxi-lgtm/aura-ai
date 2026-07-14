import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  computeAndStoreNatalChart,
  getOrComputeNatalChart,
} from "@/lib/services/natal-chart-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

export async function GET() {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ enabled: false, chart: null });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(ctx.profileUserId, "natal_chart_read");
  if (rateLimited) return rateLimited;

  const chart = await getOrComputeNatalChart(ctx.profileUserId);
  return NextResponse.json({ enabled: true, chart });
}

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(ctx.profileUserId, "natal_chart_recompute");
  if (rateLimited) return rateLimited;

  const chart = await computeAndStoreNatalChart(ctx.profileUserId);
  return NextResponse.json({ ok: true, enabled: true, chart });
}
