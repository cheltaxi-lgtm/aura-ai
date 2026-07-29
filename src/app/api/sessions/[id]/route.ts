import { NextRequest, NextResponse } from "next/server";

import { ensureDb, query } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { deleteConsultationSession, getSession } from "@/lib/session";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;
  if (!sessionId?.trim()) {
    return NextResponse.json({ error: "session id required" }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const session = await getSession(sessionId);
  if (!session || session.user_id !== profileUserId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { rows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM chat_messages WHERE session_id = $1`,
    [session.id]
  );
  const messageCount = Number.parseInt(rows[0]?.cnt || "0", 10) || 0;

  const createdAt =
    session.created_at instanceof Date
      ? session.created_at.toISOString()
      : session.created_at
        ? String(session.created_at)
        : new Date().toISOString();
  const updatedAt =
    session.updated_at instanceof Date
      ? session.updated_at.toISOString()
      : session.updated_at
        ? String(session.updated_at)
        : createdAt;

  return NextResponse.json({
    id: session.id,
    characterKey: session.character_key || "veronika",
    intention: session.intention ?? null,
    spreadType: session.spread_type ?? null,
    spreadId: session.spread_id ?? null,
    cards: session.cards ?? null,
    status: session.status || "active",
    messageCount,
    createdAt,
    updatedAt,
    topicSummary: null,
    keyCards: null,
    prediction: null,
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;
  if (!sessionId?.trim()) {
    return NextResponse.json({ error: "session id required" }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const ok = await deleteConsultationSession(sessionId, profileUserId);
  if (!ok) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
