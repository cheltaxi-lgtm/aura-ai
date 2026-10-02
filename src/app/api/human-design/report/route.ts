import { NextRequest, NextResponse } from 'next/server';
import { profileAuthFailureResponse, resolveProfileUserContext } from '@/lib/require-auth';
import { isHumanDesignEnabled } from '@/lib/settings';
import { enforcePaidRouteRateLimit } from '@/lib/api-guards';
import { HD_UUID_RE, getHdReportForChart, toPublicHdReport } from '@/lib/services/human-design-service';
import { sanitizeHdReportText } from '@/lib/human-design';
import { handleHdPurchase } from '@/lib/services/hd-purchase-route';

export const maxDuration = 800;
export async function POST(request: NextRequest) { return handleHdPurchase(request, 'personal'); }

export async function GET(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_chart_read");
  if (rateLimited) return rateLimited;

  const chartId = request.nextUrl.searchParams.get("chartId") ?? "";
  if (!HD_UUID_RE.test(chartId)) {
    return NextResponse.json({ report: null });
  }
  const report = await getHdReportForChart(chartId, resolved.profileUserId);
  if (!report) return NextResponse.json({ report: null });
  const pub = toPublicHdReport(report);
  if (pub.reportText) {
    pub.reportText = sanitizeHdReportText(pub.reportText);
  }
  return NextResponse.json({ report: pub });
}
