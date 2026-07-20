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
import { getSpread } from "@/lib/spreads";

type RouteParams = { params: Promise<{ token: string }> };

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
  const existing = await getJointReadingByToken(token);
  if (!existing || existing.status === "expired") {
    return NextResponse.json({ error: "Invite expired or not found" }, { status: 404 });
  }

  let reading = "";
  let cards: { name: string; position?: string }[] = [];
  let sessionId: string | undefined;
  let characterKey = "veronika";
  let role: "initiator" | "partner" = "partner";

  try {
    const body = await request.json();
    reading = typeof body.reading === "string" ? body.reading.trim() : "";
    sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    characterKey = typeof body.characterKey === "string" ? body.characterKey : characterKey;
    if (body.role === "initiator" || body.role === "partner") role = body.role;
    if (Array.isArray(body.cards)) {
      cards = body.cards
        .filter((c: unknown) => c && typeof c === "object" && typeof (c as { name?: string }).name === "string")
        .map((c: { name: string; position?: string }) => ({
          name: c.name.trim(),
          position: typeof c.position === "string" ? c.position : undefined,
        }));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Matches the MIN_STORED_READING_CHARS convention used elsewhere (e.g.
  // src/lib/session-spread-reading.ts) for "is this a real reading" checks.
  if (reading.length < 80) {
    return NextResponse.json({ error: "Reading too short" }, { status: 400 });
  }

  const expectedCardCount = getSpread(existing.spread_id).cardCount;
  if (cards.length !== expectedCardCount) {
    return NextResponse.json({ error: "Cards do not match the invite's spread" }, { status: 400 });
  }

  const inferredRole = resolveJointParticipantRole(existing, authed.profileUserId) ?? role;
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
    sessionId,
    characterKey,
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
