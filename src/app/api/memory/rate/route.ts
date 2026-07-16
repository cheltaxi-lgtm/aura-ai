import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";

/** Rate last session memory for a master (1–5). */
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json().catch(() => ({}));
    const characterKey = await resolveApiCharacterId(body.characterKey ?? body.characterId);
    const rating = Number(body.outcomeRating ?? body.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
    }

    const memoryId = body.memoryId as string | undefined;

    if (memoryId) {
      const { rows } = await query<{ id: string }>(
        `UPDATE session_memories
         SET outcome_rating = $3
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [memoryId, profileUserId, Math.round(rating)]
      );
      if (!rows[0]) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, memoryId: rows[0].id });
    }

    const { rows } = await query<{ id: string }>(
      `UPDATE session_memories
       SET outcome_rating = $3
       WHERE id = (
         SELECT id FROM session_memories
         WHERE user_id = $1 AND character_key = $2
         ORDER BY session_date DESC
         LIMIT 1
       )
       RETURNING id`,
      [profileUserId, characterKey, Math.round(rating)]
    );

    if (!rows[0]) {
      return NextResponse.json({ error: "no_memory" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, memoryId: rows[0].id });
  } catch (error) {
    console.error("Memory rate error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
