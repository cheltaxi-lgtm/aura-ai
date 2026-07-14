import { NextRequest, NextResponse } from "next/server";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";

type RouteParams = { params: Promise<{ token: string }> };

const PUBLIC_REPORT_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const limited = await enforcePaidRouteRateLimit(clientIp(request), "report_share_public");
  if (limited) {
    for (const [name, value] of Object.entries(PUBLIC_REPORT_HEADERS)) {
      limited.headers.set(name, value);
    }
    return limited;
  }
  const { token } = await params;
  const share = await getActivePublicReportShare(token);
  if (!share) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PUBLIC_REPORT_HEADERS }
    );
  }
  return NextResponse.json(
    share,
    { headers: PUBLIC_REPORT_HEADERS }
  );
}
