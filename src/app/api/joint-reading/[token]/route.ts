import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  ensureCombinedReading,
  getJointReadingByToken,
  resolveJointParticipantRole,
} from "@/lib/joint-reading-service";
import { requireProfileUserId } from "@/lib/require-auth";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { token } = await params;
  let row = await getJointReadingByToken(token);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.initiator_reading?.trim() && row.partner_reading?.trim() && !row.combined_reading) {
    row = await ensureCombinedReading(row);
  }

  const authed = await requireProfileUserId();
  const viewerId = authed?.profileUserId ?? null;
  const participantRole = viewerId ? resolveJointParticipantRole(row, viewerId) : null;
  const isInitiator = participantRole === "initiator";
  const isPartner = participantRole === "partner";
  const canViewPrivate = isInitiator || isPartner || row.status === "completed";
  const canStartAsInitiator = Boolean(viewerId === row.initiator_user_id && !row.initiator_reading);
  const canStartAsPartner = Boolean(
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
    initiatorReading: isInitiator || row.status === "completed" ? row.initiator_reading : null,
    partnerReading: isPartner || row.status === "completed" ? row.partner_reading : null,
    viewerRole: isInitiator ? "initiator" : isPartner ? "partner" : viewerId ? "guest" : null,
    canStartAsInitiator,
    canStartAsPartner,
    isLoggedIn: Boolean(viewerId),
  });
}
