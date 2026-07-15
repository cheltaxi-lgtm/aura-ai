import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  parseCompatibilityLabel,
  parseManualPartnerInput,
} from "@/lib/natal/compatibility-api";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { createManualCompatibility } from "@/lib/services/natal-compatibility-service";

export const maxDuration = 60;

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
    const body = (await request.json()) as Record<string, unknown>;
    if (body.partnerDataAuthorized !== true) {
      return NextResponse.json(
        { error: "partner_data_authorization_required" },
        { status: 400 }
      );
    }
    const result = await createManualCompatibility({
      ownerUserId: auth.profileUserId,
      ownerLabel: parseCompatibilityLabel(body.ownerLabel),
      partnerLabel: parseCompatibilityLabel(body.partnerLabel),
      partnerInput: parseManualPartnerInput(body.partner),
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    if (code.startsWith("invalid_")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "chart_unavailable" || code === "partner_chart_unavailable") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    console.warn("[natal-compatibility] manual creation failed");
    return NextResponse.json({ error: "compatibility_create_failed" }, { status: 500 });
  }
}
