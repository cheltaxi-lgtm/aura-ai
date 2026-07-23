import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  getJointReadingByToken,
  resolveJointParticipantRole,
} from "@/lib/joint-reading-service";
import { requireProfileUserId } from "@/lib/require-auth";
import { clientIp, enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { sanitizeSynastryForClient } from "@/lib/natal/synastry";
import { isNatalChartEnabled } from "@/lib/settings";
import { schedulePaidAsyncJob } from "@/lib/async-job-enqueue";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(clientIp(request), "joint_reading_view");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  const row = await getJointReadingByToken(token);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authed = await requireProfileUserId();
  const viewerId = authed?.profileUserId ?? null;
  const participantRole = viewerId ? resolveJointParticipantRole(row, viewerId) : null;

  let combinedJobId: string | null = null;
  let combinedPending = false;
  if (
    participantRole &&
    row.initiator_reading?.trim() &&
    row.partner_reading?.trim() &&
    !row.combined_reading
  ) {
    combinedJobId = await schedulePaidAsyncJob({
      userId: row.initiator_user_id,
      kind: "joint_combined",
      payload: { token: row.token, async: false },
      bypassDeliveryGate: true,
    });
    combinedPending = Boolean(combinedJobId) || Boolean(row.combined_claim_token);
  }

  const isInitiator = participantRole === "initiator";
  const isPartner = participantRole === "partner";
  const canViewPrivate = isInitiator || isPartner;
  const natalEnabled = await isNatalChartEnabled();
  // Completion owns computation and persistence. Polling only reads the
  // immutable versioned snapshot, including for legacy rows without one.
  const currentSynastry =
    natalEnabled && canViewPrivate && row.status === "completed" &&
    row.synastry_data && typeof row.synastry_data === "object"
      ? row.synastry_data
      : null;
  const isExpired = row.status === "expired";
  const canStartAsInitiator = Boolean(
    !isExpired && viewerId === row.initiator_user_id && !row.initiator_reading
  );
  const canStartAsPartner = Boolean(
    !isExpired &&
      viewerId &&
      viewerId !== row.initiator_user_id &&
      !row.partner_reading &&
      (!row.partner_user_id || row.partner_user_id === viewerId)
  );

  return NextResponse.json({
    token: row.token,
    status: row.status,
    spreadId: row.spread_id,
    intentSlug: row.intent_slug,
    initiatorName: row.initiator_name,
    partnerName: row.partner_name,
    expiresAt: row.expires_at,
    hasInitiatorReading: Boolean(row.initiator_reading),
    hasPartnerReading: Boolean(row.partner_reading),
    combinedReading: canViewPrivate ? row.combined_reading : null,
    combinedPending,
    combinedJobId,
    initiatorReading: isInitiator ? row.initiator_reading : null,
    partnerReading: isPartner ? row.partner_reading : null,
    viewerRole: isInitiator ? "initiator" : isPartner ? "partner" : viewerId ? "guest" : null,
    canStartAsInitiator,
    canStartAsPartner,
    isLoggedIn: Boolean(viewerId),
    synastry:
      currentSynastry
        ? sanitizeSynastryForClient(currentSynastry)
        : null,
  });
}
