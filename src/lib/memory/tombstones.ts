/**
 * Suppression fingerprints for deleted facts — blocks re-ingest of the same
 * normalized text without storing the original PII.
 */
import { createHmac } from "node:crypto";
import { query } from "@/lib/db";

function tombstoneSecret(): string {
  return (
    process.env.MEMORY_TOMBSTONE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-memory-tombstone-secret"
  );
}

export function normalizeFactForFingerprint(fact: string): string {
  return fact
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "")
    .slice(0, 600);
}

export function factFingerprint(fact: string): string {
  return createHmac("sha256", tombstoneSecret())
    .update(normalizeFactForFingerprint(fact), "utf8")
    .digest("hex");
}

export async function addTombstone(
  userId: string,
  fact: string,
  predicateKey?: string | null,
  expiresDays = 365
): Promise<void> {
  if (!userId || !fact.trim()) return;
  const hmac = factFingerprint(fact);
  await query(
    `INSERT INTO user_memory_tombstones (user_id, fact_hmac, predicate_key, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
     ON CONFLICT (user_id, fact_hmac) DO UPDATE SET
       predicate_key = COALESCE(EXCLUDED.predicate_key, user_memory_tombstones.predicate_key),
       expires_at = EXCLUDED.expires_at`,
    [userId, hmac, predicateKey ?? null, String(expiresDays)]
  );
}

export async function isFactTombstoned(userId: string, fact: string): Promise<boolean> {
  if (!userId || !fact.trim()) return false;
  const hmac = factFingerprint(fact);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM user_memory_tombstones
      WHERE user_id = $1
        AND fact_hmac = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId, hmac]
  );
  return Boolean(rows[0]);
}

export async function purgeTombstones(userId: string): Promise<number> {
  const res = await query(`DELETE FROM user_memory_tombstones WHERE user_id = $1`, [userId]);
  return res.rowCount ?? 0;
}

export async function expireOldTombstones(limit = 1000): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `DELETE FROM user_memory_tombstones
      WHERE id IN (
        SELECT id FROM user_memory_tombstones
         WHERE expires_at IS NOT NULL AND expires_at < NOW()
         LIMIT $1
      )
      RETURNING id`,
    [limit]
  );
  return rows.length;
}
