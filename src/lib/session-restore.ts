import { query } from "@/lib/db";
import { getActiveSessionMessages, type SessionRow } from "@/lib/session";

export type ConsultationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: Date;
};

export type ConsultationSession = {
  id: string;
  character_key: string | null;
  intention: string | null;
  spread_type: string | null;
  cards: string[] | null;
  status: string;
  awaiting_context: boolean;
  created_at: Date;
  updated_at: Date;
  messages: ConsultationMessage[];
};

function mapSessionRow(row: SessionRow & { status?: string; created_at?: Date; updated_at?: Date }): Omit<ConsultationSession, "messages"> {
  return {
    id: row.id,
    character_key: row.character_key ?? null,
    intention: row.intention ?? null,
    spread_type: row.spread_type ?? null,
    cards: row.cards ?? null,
    status: row.status ?? "active",
    awaiting_context: Boolean(row.awaiting_context),
    created_at: row.created_at ?? new Date(),
    updated_at: row.updated_at ?? new Date(),
  };
}

/** Single source of truth: active consultation from sessions + its chat_messages only. */
export async function restoreConsultationSession(
  userId: string,
  characterKey: string,
  sessionId?: string | null
): Promise<ConsultationSession | null> {
  let row: (SessionRow & { status: string; created_at: Date; updated_at: Date }) | undefined;

  if (sessionId) {
    const { rows } = await query<SessionRow & { status: string; created_at: Date; updated_at: Date }>(
      `SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
              COALESCE(awaiting_context, false) AS awaiting_context,
              character_key, intention, spread_type, cards, status, created_at, updated_at
       FROM sessions
       WHERE id = $1 AND user_id = $2 AND character_key = $3`,
      [sessionId, userId, characterKey]
    );
    row = rows[0];
  } else {
    const { rows } = await query<SessionRow & { status: string; created_at: Date; updated_at: Date }>(
      `SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
              COALESCE(awaiting_context, false) AS awaiting_context,
              character_key, intention, spread_type, cards, status, created_at, updated_at
       FROM sessions
       WHERE user_id = $1
         AND character_key = $2
         AND COALESCE(status, 'active') = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, characterKey]
    );
    row = rows[0];
  }

  if (!row) return null;

  const messageRows = await getActiveSessionMessages(userId, characterKey, row.id, 50);

  return {
    ...mapSessionRow(row),
    messages: messageRows.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
  };
}

export async function restoreCompletedConsultationSession(
  userId: string,
  characterKey: string,
  sessionId: string
): Promise<ConsultationSession | null> {
  const { rows } = await query<SessionRow & { status: string; created_at: Date; updated_at: Date }>(
    `SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
            COALESCE(awaiting_context, false) AS awaiting_context,
            character_key, intention, spread_type, cards, status, created_at, updated_at
     FROM sessions
     WHERE id = $1 AND user_id = $2 AND character_key = $3 AND status = 'completed'`,
    [sessionId, userId, characterKey]
  );
  const row = rows[0];
  if (!row) return null;

  const messageRows = await getActiveSessionMessages(userId, characterKey, row.id, 50);

  return {
    ...mapSessionRow(row),
    messages: messageRows.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
  };
}
