import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { listConsultationSessions } from "@/lib/session";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawCharacterKey = request.nextUrl.searchParams.get("characterKey");
  if (!rawCharacterKey) {
    return NextResponse.json({ error: "characterKey required" }, { status: 400 });
  }

  let characterKey: string;
  try {
    characterKey = await resolveApiCharacterId(rawCharacterKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid characterKey";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ active: null, completed: [] });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { active, completed } = await listConsultationSessions(profileUserId, characterKey);

  const mapSession = (s: (typeof completed)[0]) => ({
    id: s.id,
    intention: s.intention,
    spreadType: s.spread_type,
    spreadId: s.spread_id,
    cards: s.cards,
    status: s.status,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
    topicSummary: s.topic_summary,
    keyCards: s.key_cards,
    prediction: s.prediction,
    matrixSubjectId: s.matrix_subject_id ?? null,
    matrixBirthDate: s.matrix_birth_date ?? null,
    matrixSubjectName: s.matrix_subject_name ?? null,
    matrixSubjectKind: s.matrix_subject_kind ?? null,
    readingPreview: s.reading_preview ?? null,
    customQuestion: s.custom_question ?? null,
  });

  return NextResponse.json({
    active: active ? mapSession(active) : null,
    completed: completed.map(mapSession),
  });
}
