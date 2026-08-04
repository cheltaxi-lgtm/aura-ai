import { NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  listHdChartsForUser,
  toPublicHdChartPayload,
} from "@/lib/services/human-design-service";

export async function GET() {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ enabled: false, charts: [] });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_chart_read");
  if (rateLimited) return rateLimited;

  const charts = await listHdChartsForUser(resolved.profileUserId);
  return NextResponse.json({
    enabled: true,
    charts: charts.map((c) => ({ ...toPublicHdChartPayload(c), createdAt: c.createdAt })),
  });
}
