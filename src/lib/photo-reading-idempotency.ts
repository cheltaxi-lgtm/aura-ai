import { createHash } from "crypto";
import { query, queryClient, type PoolClient } from "@/lib/db";
import { withReadingLock } from "@/lib/reading-lock";
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

/** Follow retries of the original spend, so a failed retry cannot debit twice. */
export async function getPhotoChargeReuseState(userId: string, originalTransactionId: string) {
  const retryPrefix = `photo-retry:${originalTransactionId}:`;
  const { rows } = await query<{ id: string; amount: string; refunded: boolean }>(
    `SELECT t.id, ABS(t.amount)::text AS amount,
       EXISTS (SELECT 1 FROM rune_transactions rf
               WHERE rf.type = 'refund' AND rf.refund_of_transaction_id = t.id) AS refunded
     FROM rune_transactions t
     WHERE t.user_id = $1 AND t.type = 'spend' AND t.action_type = 'VISION_ANALYSIS'
       AND (t.id = $2 OR LEFT(t.idempotency_key, LENGTH($3)) = $3)
     ORDER BY t.created_at DESC LIMIT 1`,
    [userId, originalTransactionId, retryPrefix]
  );
  const row = rows[0];
  return row ? { transactionId: row.id, amount: Number(row.amount), refunded: row.refunded, retryPrefix } : null;
}

/** Serialize photo interpretation per user + spread (prevents duplicate rune charges). */
export async function withPhotoReadingLock<T>(
  userId: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = photoReadingLockKey(userId, key);
  return withReadingLock(lockKey, fn);
}
