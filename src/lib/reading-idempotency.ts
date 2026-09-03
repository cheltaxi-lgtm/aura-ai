import { query, type PoolClient, queryClient } from "@/lib/db";
import { withReadingLock } from "@/lib/reading-lock";
import { tarotCardsKey } from "@/lib/tarot";
import {
  isNumerologToolId,
  numerologReadingCacheKey,
  type NumerologToolParams,
} from "@/lib/numerology/tools";

export type SavedSpreadReadingRow = {
  id: string;
  context_data: Record<string, unknown>;
  is_paid: boolean;
  created_at: Date;
};

function spreadReadingLockKey(userId: string, characterId: string, cardsKey: string): string {
  return `spread-reading:${userId}:${characterId}:${cardsKey}`;
}

function storedNumerologReadingKey(
  characterId: string,
  ctx: Record<string, unknown>
): string | null {
  const toolId = ctx.numerologToolId;
  if (typeof toolId !== "string" || !isNumerologToolId(toolId)) return null;
  const stored = ctx.tarotCards as { name: string }[] | undefined;
  const birthDate = typeof ctx.birthDate === "string" ? ctx.birthDate : null;
  const params = (ctx.numerologToolParams ?? null) as NumerologToolParams | null;
  return numerologReadingCacheKey({
    characterId,
    toolId,
    birthDate,
    cardNames: stored?.map((c) => c.name) ?? [],
    params,
  });
}

function spreadReadingMatchesRow(
  characterId: string,
  cardsKey: string,
  ctx: Record<string, unknown>
): boolean {
  if (typeof ctx.reading !== "string") return false;
  if (cardsKey.startsWith("numerolog:")) {
    const storedKey = storedNumerologReadingKey(characterId, ctx);
    return storedKey === cardsKey;
  }
  const stored = ctx.tarotCards as { name: string }[] | undefined;
  return tarotCardsKey(stored) === cardsKey;
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
    rows.find((row) => spreadReadingMatchesRow(characterId, cardsKey, row.context_data)) ?? null
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
  return withReadingLock(lockKey, fn);
}
