import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";

// Shared by consent changes, purge and all fact writers. Acquire before row locks.
export const FACT_WRITE_LOCK_CLASS = 823_401;

export async function lockUserMemory(client: PoolClient, userId: string): Promise<void> {
  await queryClient(client, "SELECT pg_advisory_xact_lock($1, hashtext($2))", [FACT_WRITE_LOCK_CLASS, userId]);
}

export async function withUserMemoryLock<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    await lockUserMemory(client, userId);
    return fn(client);
  });
}

export type MemoryWriteConsent = {
  generation: string;
  memoryEnabled: boolean;
  autoCaptureEnabled: boolean;
  sensitiveCaptureEnabled: boolean;
};

/** Capture before long work. Existing async sources predating a consent change cannot be recaptured. */
export async function captureMemoryGeneration(userId: string, sourceCreatedAt?: Date | string | null): Promise<string | null> {
  try {
    const { rows } = await query(`SELECT capture_generation::text AS generation FROM user_memory_preferences
      WHERE user_id=$1 AND memory_enabled AND auto_capture_enabled
        AND ($2::timestamptz IS NULL OR capture_changed_at <= $2::timestamptz)`, [userId, sourceCreatedAt ?? null]);
    return rows[0]?.generation ?? null;
  } catch { return null; }
}

export async function readMemoryWriteConsent(userId: string, client?: PoolClient): Promise<MemoryWriteConsent | null> {
  const run: typeof query = client ? (queryClient.bind(null, client) as typeof query) : query;
  const { rows } = await run(
    `SELECT capture_generation::text AS generation, memory_enabled, auto_capture_enabled, sensitive_capture_enabled
       FROM user_memory_preferences WHERE user_id = $1`, [userId]);
  const row = rows[0];
  return row ? {
    generation: row.generation,
    memoryEnabled: row.memory_enabled,
    autoCaptureEnabled: row.auto_capture_enabled,
    sensitiveCaptureEnabled: row.sensitive_capture_enabled,
  } : null;
}
