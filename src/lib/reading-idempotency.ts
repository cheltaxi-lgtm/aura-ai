import { query, type PoolClient, queryClient } from "@/lib/db";
import { tarotCardsKey } from "@/lib/tarot";

export type SavedSpreadReadingRow = {
  id: string;
  context_data: Record<string, unknown>;
  is_paid: boolean;
  created_at: Date;
};

function spreadReadingLockKey(userId: string, characterId: string, cardsKey: string): string {
  return `spread-reading:${userId}:${characterId}:${cardsKey}`;
}

export async function findSpreadReadingEntry(
  userId: string,
  characterId: string,
  cardsKey: string,
  client?: PoolClient
): Promise<SavedSpreadReadingRow | null> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;

  const { rows } = await run<{
    id: string;
    context_data: Record<string, unknown>;
    is_paid: boolean;
    created_at: Date;
  }>(
    `SELECT id, context_data, is_paid, created_at
     FROM history
     WHERE user_id = $1
       AND character_name = $2
       AND context_data->>'type' = 'reading'
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId, characterId]
  );

  return (
    rows.find((row) => {
      if (typeof row.context_data?.reading !== "string") return false;
      const stored = row.context_data.tarotCards as { name: string }[] | undefined;
      return tarotCardsKey(stored) === cardsKey;
    }) ?? null
  ) as SavedSpreadReadingRow | null;
}

/** Serialize spread reading generation per user + master + cards (prevents duplicate rune charges). */
export async function withSpreadReadingLock<T>(
  userId: string,
  characterId: string,
  cardsKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = spreadReadingLockKey(userId, characterId, cardsKey);
  await query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
  try {
    return await fn();
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {});
  }
}
