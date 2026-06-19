import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession, type SessionRow } from "@/lib/session";

export async function linkSessionToProfile(sessionId: string, profileUserId: string): Promise<void> {
  await query(
    `UPDATE sessions SET user_id = $2, updated_at = NOW()
     WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [sessionId, profileUserId]
  );
}

export async function resolveSessionForUser(
  sessionId: string | undefined,
  profileUserId: string | null
): Promise<{ session: SessionRow | null; error: NextResponse | null }> {
  if (!sessionId) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "session_required", message: "Обновите страницу — сессия не найдена" },
        { status: 400 }
      ),
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "session_not_found" }, { status: 404 }),
    };
  }

  if (profileUserId) {
    if (session.user_id && session.user_id !== profileUserId) {
      return {
        session: null,
        error: NextResponse.json({ error: "session_forbidden" }, { status: 403 }),
      };
    }
    if (!session.user_id) {
      await linkSessionToProfile(sessionId, profileUserId);
      const linked = await getSession(sessionId);
      return { session: linked ?? session, error: null };
    }
  }

  return { session, error: null };
}
