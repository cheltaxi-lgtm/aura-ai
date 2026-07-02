import { createHash } from "crypto";
import { query, queryClient, type PoolClient } from "@/lib/db";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";

export type SavedPhotoReadingRow = {
  id: string;
  context_data: Record<string, unknown>;
  is_paid: boolean;
  created_at: Date;
};

function photoReadingLockKey(userId: string, key: string): string {
  return `photo-reading:${userId}:${key}`;
}

export function buildPhotoSpreadKey(
  characterId: string,
  spread: RedrawSpread,
  question: string
): string {
  const cards = spread.cards
    .map((c) => `${c.name}:${c.reversed ? "1" : "0"}:${c.position ?? ""}`)
    .join("|");
  const q = question.trim().slice(0, 200);
  return createHash("sha256")
    .update(`${characterId}:${cards}:${q}`)
    .digest("hex")
    .slice(0, 32);
}

function rowMatchesKey(
  ctx: Record<string, unknown>,
  spreadKey: string,
  idempotencyKey?: string
): boolean {
  if (idempotencyKey && ctx.idempotencyKey === idempotencyKey) return true;
  return typeof ctx.photoSpreadKey === "string" && ctx.photoSpreadKey === spreadKey;
}

export async function findPhotoReadingEntry(
  userId: string,
  spreadKey: string,
  idempotencyKey?: string,
  client?: PoolClient
): Promise<SavedPhotoReadingRow | null> {
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
       AND context_data->>'type' = 'photo_reading'
     ORDER BY created_at DESC
     LIMIT 40`,
    [userId]
  );

  return (
    rows.find((row) => rowMatchesKey(row.context_data, spreadKey, idempotencyKey)) ?? null
  ) as SavedPhotoReadingRow | null;
}

export async function countUserPhotoReadings(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'photo_reading'`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10) || 0;
}

/** Serialize photo interpretation per user + spread (prevents duplicate rune charges). */
export async function withPhotoReadingLock<T>(
  userId: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = photoReadingLockKey(userId, key);
  await query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
  try {
    return await fn();
  } finally {
    await query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {});
  }
}
