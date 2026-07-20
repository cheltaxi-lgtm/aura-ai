import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { findStoredSpreadReading } from "@/lib/session-spread-reading";
import { attachSpreadToJointReading } from "@/lib/joint-reading-service";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { normalizeSpreadId, spreadPositionLabels } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * Re-attaches an already-generated individual reading (identified by sessionId)
 * to a joint-reading invite, for when the initial attach inside
 * /api/intention-spread (and its /complete fallback) both failed. Avoids
 * forcing the user to redo — and repay for — the whole spread.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.profileUserId, "joint_reading_complete");
  if (rateLimited) return rateLimited;

  const { token } = await params;

  let sessionId = "";
  try {
    const body = await request.json();
    sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session || session.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Сессия не найдена." }, { status: 404 });
  }
  if (!session.character_key || !session.spread_id) {
    return NextResponse.json({ error: "Сессия ещё не завершена." }, { status: 400 });
  }

  const reading = await findStoredSpreadReading(
    authed.profileUserId,
    session.character_key,
    session
  );
  if (!reading) {
    return NextResponse.json(
      { error: "Не удалось найти сохранённый расклад для этой сессии." },
      { status: 404 }
    );
  }

  const cardNames = session.cards ?? [];
  const positionLabels = spreadPositionLabels(
    session.spread_id,
    (session.intention as SessionTopicId | null) ?? null
  );
  const cards = cardNames.map((name, i) => ({ name, position: positionLabels[i] ?? name }));

  const profile = await getUserById(authed.profileUserId);
  const result = await attachSpreadToJointReading({
    jointToken: token,
    userId: authed.profileUserId,
    profileName: normalizePersonDisplayName(profile?.name) || profile?.name || null,
    spreadId: normalizeSpreadId(session.spread_id),
    reading,
    cards,
    sessionId: session.id,
    characterKey: session.character_key,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    status: result.row.status,
    combinedReading: result.row.combined_reading,
    hasInitiatorReading: Boolean(result.row.initiator_reading),
    hasPartnerReading: Boolean(result.row.partner_reading),
    alreadySaved: result.alreadySaved ?? false,
  });
}
