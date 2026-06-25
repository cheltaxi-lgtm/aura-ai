import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";
import {
  completeConsultationSession,
  getActiveSessionMessages,
  getSession,
  saveMessage,
  updateSessionChatMeta,
} from "@/lib/session";
import {
  generateSessionSummary,
  upsertSessionMemoryFromChat,
} from "@/lib/session-memory";
import { query } from "@/lib/db";
import { topicLabel } from "@/lib/session-topics";
import type { SessionTopicId } from "@/lib/session-topics";

export async function PATCH(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const archiveOnly = Boolean(body.archiveOnly);
  const mood = typeof body.mood === "string" ? body.mood.trim().slice(0, 80) : undefined;
  const outcomeRating =
    typeof body.outcomeRating === "number" && body.outcomeRating >= 1 && body.outcomeRating <= 5
      ? Math.round(body.outcomeRating)
      : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let session = await getSession(sessionId);
  if (!session || session.user_id !== profileUserId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "completed") {
    return NextResponse.json({ ok: true, status: "completed", alreadyCompleted: true });
  }

  let characterKey = session.character_key?.trim() ?? "";
  if (!characterKey && typeof body.characterKey === "string" && body.characterKey.trim()) {
    try {
      characterKey = await resolveApiCharacterId(body.characterKey.trim());
      await updateSessionChatMeta(sessionId, { characterKey });
      session = await getSession(sessionId);
    } catch {
      /* invalid characterKey */
    }
  }

  if (!characterKey) {
    return NextResponse.json({ error: "Session has no master" }, { status: 400 });
  }

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const cardNames = session.cards?.length ? session.cards : [];
  const messages = await getActiveSessionMessages(
    profileUserId,
    characterKey,
    sessionId,
    50
  );

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Клиент" : "Мастер"}: ${m.content}`)
    .join("\n");

  const topicFromIntention = session.intention
    ? topicLabel(session.intention as SessionTopicId)
    : "Сеанс";

  let summary: Awaited<ReturnType<typeof generateSessionSummary>> = null;
  if (transcript.trim() && !archiveOnly) {
    summary = await generateSessionSummary(transcript, cardNames);
  }

  const topicSummary = summary?.topicSummary ?? topicFromIntention;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  await upsertSessionMemoryFromChat({
    userId: profileUserId,
    sessionId,
    characterKey,
    topicSummary,
    keyCards: summary?.keyCards?.length ? summary.keyCards : cardNames.slice(0, 3),
    prediction:
      summary?.prediction ??
      lastAssistant?.content?.slice(0, 1000) ??
      (archiveOnly ? "Сеанс отправлен в архив" : topicSummary),
    mood: mood ?? summary?.mood,
  });

  if (outcomeRating != null) {
    await query(
      `UPDATE session_memories SET outcome_rating = $3
       WHERE session_id = $2 AND user_id = $1`,
      [profileUserId, sessionId, outcomeRating]
    );
  }

  if (!archiveOnly) {
    const prediction =
      summary?.prediction ?? lastAssistant?.content?.slice(0, 1000) ?? topicSummary;
    const finalMessage = prediction.trim()
      ? `Итог сеанса: ${prediction.trim()}`
      : `Сеанс на тему «${topicSummary}» завершён. До новых встреч.`;

    await saveMessage(sessionId, characterKey, "assistant", finalMessage, profileUserId);
  }

  const ok = await completeConsultationSession(sessionId, profileUserId);
  if (!ok) {
    return NextResponse.json({ error: "Session already completed" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    status: "completed",
    archived: archiveOnly,
  });
}
