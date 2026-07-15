import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  isCompatibilityInviteToken,
  parseCompatibilityLabel,
} from "@/lib/natal/compatibility-api";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  acceptCompatibilityInvite,
  getInviteStatus,
} from "@/lib/services/natal-compatibility-service";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_: NextRequest, { params }: RouteParams) {
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
  const { token } = await params;
  if (!isCompatibilityInviteToken(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const record = await getInviteStatus(token, auth.profileUserId);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ record });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "natal_compatibility_accept"
  );
  if (limited) return limited;
  const { token } = await params;
  if (!isCompatibilityInviteToken(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.participantConsentAcknowledged !== true) {
      return NextResponse.json(
        { error: "participant_consent_required" },
        { status: 400 }
      );
    }
    const result = await acceptCompatibilityInvite({
      token,
      participantUserId: auth.profileUserId,
      participantLabel: parseCompatibilityLabel(body.participantLabel),
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "accept_failed";
    if (code === "invite_not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (code === "invite_expired") {
      return NextResponse.json({ error: code }, { status: 410 });
    }
    if (
      code === "cannot_accept_own_invite" ||
      code === "invite_already_claimed" ||
      code === "owner_chart_changed" ||
      code === "chart_unavailable"
    ) {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    if (code.startsWith("invalid_")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    console.warn("[natal-compatibility] invite acceptance failed");
    return NextResponse.json({ error: "accept_failed" }, { status: 500 });
  }
}
