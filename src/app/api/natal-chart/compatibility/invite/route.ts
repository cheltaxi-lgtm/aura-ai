import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { parseCompatibilityLabel } from "@/lib/natal/compatibility-api";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { createCompatibilityInvite } from "@/lib/services/natal-compatibility-service";

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "natal_compatibility_create"
  );
  if (limited) return limited;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await createCompatibilityInvite({
      ownerUserId: auth.profileUserId,
      ownerLabel: parseCompatibilityLabel(body.ownerLabel),
      partnerLabel: parseCompatibilityLabel(body.partnerLabel),
    });
    return NextResponse.json(
      {
        record: result.record,
        token: result.token,
        invitePath: `/api/natal-chart/compatibility/token/${result.token}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    if (code.startsWith("invalid_")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "chart_unavailable") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    console.warn("[natal-compatibility] invite creation failed");
    return NextResponse.json({ error: "compatibility_invite_failed" }, { status: 500 });
  }
}
