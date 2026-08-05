import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getLatestHistoryEntry } from "@/lib/users";
import { syncPhotoReadingSession } from "@/lib/photo-session-sync";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";
import { isPhotoReadingEnabled } from "@/lib/settings";

export async function POST(request: NextRequest) {
  if (!(await isPhotoReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  let characterId = "veronika";
  let historyId: string | undefined;

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId ?? characterId);
    if (typeof body.historyId === "string" && body.historyId.trim()) {
      historyId = body.historyId.trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let contextData: Record<string, unknown> | undefined;
  let resolvedHistoryId: string | undefined;

  if (historyId) {
    const { rows } = await query<{ id: string; context_data: Record<string, unknown> }>(
      `SELECT id, context_data FROM history
       WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
      [historyId, profileUserId]
    );
    if (rows[0]) {
      contextData = rows[0].context_data;
      resolvedHistoryId = rows[0].id;
    }
  }

  if (!contextData) {
    const entry = await getLatestHistoryEntry(profileUserId, {
      characterName: characterId,
      contextType: "photo_reading",
    });
    if (!entry) {
      return NextResponse.json({ error: "no_photo_reading" }, { status: 404 });
    }
    contextData = entry.context_data;
    resolvedHistoryId = entry.id;
  }

  const sessionId = await syncPhotoReadingSession({
    profileUserId,
    characterId,
    contextData,
    historyId: resolvedHistoryId,
    preferredSessionId:
      typeof contextData.sessionId === "string" ? contextData.sessionId : undefined,
  });

  if (!sessionId) {
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }

  return NextResponse.json({ sessionId, characterId, historyId: resolvedHistoryId });
}
