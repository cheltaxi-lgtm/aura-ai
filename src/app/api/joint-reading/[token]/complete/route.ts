import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getUserById } from "@/lib/users";
import {
  getJointReadingByToken,
  resolveJointParticipantRole,
  submitJointReadingSide,
} from "@/lib/joint-reading-service";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getSession } from "@/lib/session";
import { findStoredSpreadReading } from "@/lib/session-spread-reading";
import { getSpread, normalizeSpreadId, spreadPositionLabels } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * Attach a paid individual reading to a joint invite.
 * Reading/cards MUST come from a server-owned session (same as reattach) —
 * never trust client-supplied text (cost / integrity).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(
    authed.profileUserId,
    "joint_reading_complete"
  );
  if (rateLimited) return rateLimited;

  const { token } = await params;
  const existing = await getJointReadingByToken(token);
  if (!existing || existing.status === "expired") {
    return NextResponse.json({ error: "Invite expired or not found" }, { status: 404 });
  }

  let sessionId = "";
  let roleHint: "initiator" | "partner" | undefined;
  try {
    const body = await request.json();
    sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (body.role === "initiator" || body.role === "partner") roleHint = body.role;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required", code: "SESSION_REQUIRED" },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);
  if (!session || session.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Сессия не найдена." }, { status: 404 });
  }
  if (!session.character_key || !session.spread_id) {
    return NextResponse.json({ error: "Сессия ещё не завершена." }, { status: 400 });
  }

  const inviteSpread = normalizeSpreadId(existing.spread_id);
  const sessionSpread = normalizeSpreadId(session.spread_id);
  if (inviteSpread !== sessionSpread) {
    return NextResponse.json(
      { error: "Spread does not match the invite" },
      { status: 400 }
    );
  }

  const reading = await findStoredSpreadReading(
    authed.profileUserId,
    session.character_key,
    session
  );
  if (!reading || reading.trim().length < 80) {
    return NextResponse.json(
      { error: "Не удалось найти сохранённый расклад для этой сессии." },
      { status: 404 }
    );
  }

  const expectedCardCount = getSpread(existing.spread_id).cardCount;
  const cardNames = session.cards ?? [];
  if (cardNames.length !== expectedCardCount) {
    return NextResponse.json(
      { error: "Cards do not match the invite's spread" },
      { status: 400 }
    );
  }

  const positionLabels = spreadPositionLabels(
    session.spread_id,
    (session.intention as SessionTopicId | null) ?? null
  );
  const cards = cardNames.map((name, i) => ({
    name,
    position: positionLabels[i] ?? name,
  }));

  const inferredRole =
    resolveJointParticipantRole(existing, authed.profileUserId) ?? roleHint ?? "partner";
  if (
    inferredRole === "initiator" &&
    authed.profileUserId !== existing.initiator_user_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getUserById(authed.profileUserId);
  const updated = await submitJointReadingSide({
    token,
    userId: authed.profileUserId,
    role: inferredRole,
    reading,
    cards,
    sessionId: session.id,
    characterKey: session.character_key,
    profileName: normalizePersonDisplayName(profile?.name) || profile?.name || null,
  });

  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  return NextResponse.json({
    status: updated.row.status,
    combinedReading: updated.row.combined_reading,
    hasInitiatorReading: Boolean(updated.row.initiator_reading),
    hasPartnerReading: Boolean(updated.row.partner_reading),
    alreadySaved: updated.alreadySaved ?? false,
  });
}
