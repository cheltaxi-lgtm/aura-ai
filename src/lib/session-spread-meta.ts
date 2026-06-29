import { query } from "@/lib/db";

import { getSpread, hasCompleteSpread, normalizeSpreadId } from "@/lib/spreads";

/** Extract card/rune names from spread markdown (images, bold headers). */
export function parseCardNamesFromSpreadText(text: string, maxCards = 10): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const name = raw.trim();
    if (!name || name.length > 80 || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    names.push(name);
  };

  for (const m of text.matchAll(/!\[([^\]]+)\]\(/gu)) push(m[1]);
  for (const m of text.matchAll(/\*\*([^*]{2,60})\*\*/gu)) {
    const n = m[1].trim();
    if (/^(?:утро|день|вечер|ваш расклад|итог)$/iu.test(n)) continue;
    push(n);
  }

  return names.slice(0, maxCards);
}

export type RecoveredSpreadMeta = {
  intention?: string;
  spreadType?: "daily" | "new";
  spreadId?: string;
  cards: string[];
};

function spreadTypeFromContext(ctx: Record<string, unknown>): "daily" | "new" | undefined {
  const t = ctx.type;
  if (t === "reading") return "daily";
  if (t === "intention_spread") return "new";
  return undefined;
}

function cardsFromContext(ctx: Record<string, unknown>): string[] {
  const spreadId = normalizeSpreadId(
    typeof ctx.spreadId === "string" ? ctx.spreadId : null
  );
  const required = getSpread(spreadId).cardCount;
  const stored = ctx.tarotCards as { name?: string }[] | undefined;
  if (Array.isArray(stored)) {
    const names = stored.map((c) => c?.name?.trim()).filter(Boolean) as string[];
    if (hasCompleteSpread(names, spreadId)) return names.slice(0, required);
  }
  const reading = typeof ctx.reading === "string" ? ctx.reading : "";
  const parsed = parseCardNamesFromSpreadText(reading, required);
  return hasCompleteSpread(parsed, spreadId) ? parsed.slice(0, required) : [];
}

/** Recover spread meta from history when sessions row lost intention/cards. */
export async function recoverSpreadMetaFromHistory(
  userId: string,
  characterId: string,
  sessionId: string
): Promise<RecoveredSpreadMeta | null> {
  const { rows: bySession } = await query<{ context_data: Record<string, unknown> }>(
    `SELECT context_data FROM history
     WHERE user_id = $1 AND character_name = $2
       AND context_data->>'sessionId' = $3
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId, characterId, sessionId]
  );

  for (const row of bySession) {
    const cards = cardsFromContext(row.context_data);
    const spreadId = normalizeSpreadId(
      typeof row.context_data.spreadId === "string" ? row.context_data.spreadId : null
    );
    if (hasCompleteSpread(cards, spreadId)) {
      return {
        intention: typeof row.context_data.intention === "string"
          ? row.context_data.intention
          : undefined,
        spreadType: spreadTypeFromContext(row.context_data),
        spreadId,
        cards,
      };
    }
  }

  const { rows: latest } = await query<{ context_data: Record<string, unknown> }>(
    `SELECT context_data FROM history
     WHERE user_id = $1 AND character_name = $2
       AND context_data->>'type' IN ('intention_spread', 'reading')
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId, characterId]
  );

  for (const row of latest) {
    const cards = cardsFromContext(row.context_data);
    const spreadId = normalizeSpreadId(
      typeof row.context_data.spreadId === "string" ? row.context_data.spreadId : null
    );
    if (hasCompleteSpread(cards, spreadId)) {
      return {
        intention: typeof row.context_data.intention === "string"
          ? row.context_data.intention
          : undefined,
        spreadType: spreadTypeFromContext(row.context_data),
        spreadId,
        cards,
      };
    }
  }

  return null;
}

/** Parse cards from the first substantive assistant message in a session. */
export async function recoverSpreadMetaFromChatMessages(
  sessionId: string,
  characterId: string,
  profileUserId: string
): Promise<string[]> {
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM chat_messages
     WHERE session_id = $1 AND character_id = $2 AND role = 'assistant'
       AND (owner_user_id IS NULL OR owner_user_id = $3)
     ORDER BY created_at ASC
     LIMIT 1`,
    [sessionId, characterId, profileUserId]
  );
  const text = rows[0]?.content ?? "";
  const parsed = parseCardNamesFromSpreadText(text, 10);
  return parsed.length >= 1 ? parsed : [];
}
