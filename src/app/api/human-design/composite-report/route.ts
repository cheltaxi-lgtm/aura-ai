import { NextRequest, NextResponse } from 'next/server';
import { profileAuthFailureResponse, resolveProfileUserContext } from '@/lib/require-auth';
import { isHumanDesignEnabled } from '@/lib/settings';
import { enforcePaidRouteRateLimit } from '@/lib/api-guards';
import { HD_UUID_RE, getHdCompositeReport, toPublicHdCompositeReport } from '@/lib/services/human-design-service';
import { sanitizeHdCompositeReportText } from '@/lib/human-design';
import { handleHdPurchase } from '@/lib/services/hd-purchase-route';

export const maxDuration = 600;
export async function POST(request: NextRequest) { return handleHdPurchase(request, 'composite'); }

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

  const baseChartId = request.nextUrl.searchParams.get("baseChartId") ?? "";
  const partnerChartId = request.nextUrl.searchParams.get("partnerChartId") ?? "";
  if (!HD_UUID_RE.test(baseChartId) || !HD_UUID_RE.test(partnerChartId)) {
    return NextResponse.json({ report: null });
  }

  const report = await getHdCompositeReport(baseChartId, partnerChartId, resolved.profileUserId);
  if (!report) return NextResponse.json({ report: null });
  const pub = toPublicHdCompositeReport(report);
  if (pub.reportText) {
    pub.reportText = sanitizeHdCompositeReportText(pub.reportText);
  }
  return NextResponse.json({ report: pub });
}
