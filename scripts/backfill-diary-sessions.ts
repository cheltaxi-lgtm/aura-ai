/**
 * One-off: backfill diary entries for sessions that have spread/chat but no diary row.
 * Usage on server: npx tsx scripts/backfill-diary-sessions.ts [email]
 */
import { query, ensureDb } from "../src/lib/db";
import { createDiaryEntryForSession } from "../src/lib/diary";

async function main() {
  const email = process.argv[2]?.trim() || "gamer_club@mail.ru";
  if (!(await ensureDb())) {
    console.error("DB unavailable");
    process.exit(1);
  }

  const { rows: accounts } = await query<{ profile_user_id: string }>(
    `SELECT profile_user_id FROM user_accounts WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  const userId = accounts[0]?.profile_user_id;
  if (!userId) {
    console.error("Profile not found for", email);
    process.exit(1);
  }

  const { rows: sessions } = await query<{
    id: string;
    character_key: string | null;
    cards: string[] | null;
  }>(
    `SELECT s.id, s.character_key, s.cards
     FROM sessions s
     WHERE s.user_id = $1
       AND s.character_key IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM diary_entries d
         WHERE d.user_id = $1 AND d.session_id = s.id
       )
       AND EXISTS (
         SELECT 1 FROM chat_messages cm
         WHERE cm.session_id = s.id AND cm.role = 'assistant'
       )
     ORDER BY s.created_at DESC
     LIMIT 20`,
    [userId]
  );

  let created = 0;
  for (const session of sessions) {
    const { rows: messages } = await query<{ role: string; content: string }>(
      `SELECT role, content FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 20`,
      [session.id]
    );
    const ok = await createDiaryEntryForSession({
      userId,
      characterKey: session.character_key!,
      sessionId: session.id,
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      cards: session.cards ?? [],
    });
    if (ok) created += 1;
    console.log(session.id, session.character_key, ok ? "created" : "skipped");
  }

  const { rows: total } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM diary_entries WHERE user_id = $1`,
    [userId]
  );
  console.log(`Done: created=${created}, total=${total[0]?.cnt ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
