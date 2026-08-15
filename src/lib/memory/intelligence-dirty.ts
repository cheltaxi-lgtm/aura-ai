/**
 * Lightweight dirty marker for Memory Intelligence rebuild.
 * Isolated from user-facts to avoid circular imports.
 * Fail-safe: missing table / DB errors never throw to the write path.
 *
 * Claim/clear is generation-safe: a write during rebuild increments
 * generation and the finishing rebuild cannot delete that newer marker.
 */
import { query } from "@/lib/db";

export type MemoryIntelligenceDirtyClaim = {
  userId: string;
  claimedDirtyAt: string;
  generation: number;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function markUserMemoryIntelligenceDirty(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO user_memory_intelligence_dirty (
         user_id, dirty_at, attempts, last_error, processing_at, generation
       ) VALUES ($1, NOW(), 0, NULL, NULL, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         dirty_at = NOW(),
         last_error = NULL,
         processing_at = NULL,
         generation = user_memory_intelligence_dirty.generation + 1`,
      [userId]
    );
  } catch {
    /* V3 write path must keep working if derived tables are unavailable. */
  }
}

export async function peekUserMemoryIntelligenceDirty(
  userId: string
): Promise<MemoryIntelligenceDirtyClaim | null> {
  if (!userId) return null;
  try {
    const { rows } = await query<{
      dirty_at: Date | string;
      generation: number;
    }>(
      `SELECT dirty_at, generation FROM user_memory_intelligence_dirty WHERE user_id = $1`,
      [userId]
    );
    const row = rows[0];
    const claimedDirtyAt = iso(row?.dirty_at);
    if (!row || !claimedDirtyAt) return null;
    return { userId, claimedDirtyAt, generation: Number(row.generation) };
  } catch {
    return null;
  }
}

export async function claimDirtyIntelligenceUsers(
  limit = 10
): Promise<MemoryIntelligenceDirtyClaim[]> {
  const cap = Math.min(50, Math.max(1, limit));
  try {
    const { rows } = await query<{
      user_id: string;
      dirty_at: Date | string;
      generation: number;
    }>(
      `UPDATE user_memory_intelligence_dirty
          SET processing_at = NOW(),
              attempts = attempts + 1
        WHERE user_id IN (
          SELECT user_id
            FROM user_memory_intelligence_dirty
           WHERE processing_at IS NULL
              OR processing_at < NOW() - INTERVAL '10 minutes'
           ORDER BY dirty_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
      RETURNING user_id, dirty_at, generation`,
      [cap]
    );
    return rows
      .map((row) => {
        const claimedDirtyAt = iso(row.dirty_at);
        if (!claimedDirtyAt) return null;
        return {
          userId: row.user_id,
          claimedDirtyAt,
          generation: Number(row.generation),
        };
      })
      .filter((row): row is MemoryIntelligenceDirtyClaim => Boolean(row));
  } catch {
    return [];
  }
}

export async function clearUserMemoryIntelligenceDirty(
  userId: string,
  generation: number
): Promise<boolean> {
  if (!userId || !Number.isFinite(generation)) return false;
  try {
    const result = await query(
      `DELETE FROM user_memory_intelligence_dirty
        WHERE user_id = $1
          AND generation = $2`,
      [userId, generation]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function failUserMemoryIntelligenceDirty(
  userId: string,
  generation?: number
): Promise<void> {
  if (!userId) return;
  try {
    if (generation != null) {
      await query(
        `UPDATE user_memory_intelligence_dirty
            SET processing_at = NULL,
                last_error = 'rebuild_failed'
          WHERE user_id = $1
            AND generation = $2`,
        [userId, generation]
      );
      return;
    }
    await query(
      `UPDATE user_memory_intelligence_dirty
          SET processing_at = NULL,
              last_error = 'rebuild_failed'
        WHERE user_id = $1`,
      [userId]
    );
  } catch {
    /* ignore — never log derived content */
  }
}

export async function purgeUserMemoryIntelligence(userId: string): Promise<{
  snapshotsRemoved: number;
  episodesRemoved: number;
  dirtyRemoved: number;
}> {
  if (!userId) {
    return { snapshotsRemoved: 0, episodesRemoved: 0, dirtyRemoved: 0 };
  }
  try {
    const snapshots = await query(`DELETE FROM user_memory_state_snapshots WHERE user_id = $1`, [
      userId,
    ]);
    const episodes = await query(`DELETE FROM user_memory_episodes WHERE user_id = $1`, [userId]);
    const dirty = await query(`DELETE FROM user_memory_intelligence_dirty WHERE user_id = $1`, [
      userId,
    ]);
    return {
      snapshotsRemoved: snapshots.rowCount ?? 0,
      episodesRemoved: episodes.rowCount ?? 0,
      dirtyRemoved: dirty.rowCount ?? 0,
    };
  } catch {
    return { snapshotsRemoved: 0, episodesRemoved: 0, dirtyRemoved: 0 };
  }
}

export type MemoryIntelligenceOpsCounts = {
  memory_intelligence_dirty_count: number;
  memory_intelligence_processing_count: number;
  memory_intelligence_failed_count: number;
  memory_intelligence_rebuild_truncated_count: number;
};

const EMPTY_OPS: MemoryIntelligenceOpsCounts = {
  memory_intelligence_dirty_count: 0,
  memory_intelligence_processing_count: 0,
  memory_intelligence_failed_count: 0,
  memory_intelligence_rebuild_truncated_count: 0,
};

/** Privacy-safe queue + truncation counters. Numbers only. */
export async function countMemoryIntelligenceOps(): Promise<MemoryIntelligenceOpsCounts> {
  try {
    const [queue, truncated] = await Promise.all([
      query<{ dirty: string; processing: string; failed: string }>(
        `SELECT
           COUNT(*)::text AS dirty,
           COUNT(*) FILTER (WHERE processing_at IS NOT NULL)::text AS processing,
           COUNT(*) FILTER (WHERE last_error IS NOT NULL)::text AS failed
           FROM user_memory_intelligence_dirty`
      ),
      query<{ value: string }>(
        `SELECT value::text AS value
           FROM user_memory_intelligence_metrics
          WHERE metric = 'rebuild_truncated'`
      ),
    ]);
    return {
      memory_intelligence_dirty_count: Number(queue.rows[0]?.dirty ?? 0),
      memory_intelligence_processing_count: Number(queue.rows[0]?.processing ?? 0),
      memory_intelligence_failed_count: Number(queue.rows[0]?.failed ?? 0),
      memory_intelligence_rebuild_truncated_count: Number(truncated.rows[0]?.value ?? 0),
    };
  } catch {
    return { ...EMPTY_OPS };
  }
}

export async function incrementIntelligenceRebuildTruncated(): Promise<void> {
  try {
    await query(
      `INSERT INTO user_memory_intelligence_metrics (metric, value)
       VALUES ('rebuild_truncated', 1)
       ON CONFLICT (metric) DO UPDATE SET
         value = user_memory_intelligence_metrics.value + 1`
    );
  } catch {
    /* never log content or user ids */
  }
}

/**
 * Controlled dirty-marker seed for existing users with eligible raw facts.
 * Does not rebuild. Concurrent markers keep newer generation semantics.
 */
export async function seedMemoryIntelligenceBackfill(opts?: {
  userIds?: string[];
}): Promise<number> {
  try {
    const userIds = opts?.userIds?.filter(Boolean) ?? [];
    const result = await query(
      `INSERT INTO user_memory_intelligence_dirty (
         user_id, dirty_at, attempts, last_error, processing_at, generation
       )
       SELECT DISTINCT
         user_id,
         NOW(),
         0,
         NULL::text,
         NULL::timestamptz,
         1
         FROM user_facts
        WHERE status IN ('active', 'superseded')
          AND ($1::uuid[] IS NULL OR user_id = ANY($1::uuid[]))
       ON CONFLICT (user_id) DO UPDATE SET
         dirty_at = NOW(),
         last_error = NULL,
         processing_at = NULL,
         generation = user_memory_intelligence_dirty.generation + 1`,
      [userIds.length ? userIds : null]
    );
    return result.rowCount ?? 0;
  } catch {
    return 0;
  }
}

export async function countUserMemoryIntelligence(userId: string): Promise<{
  snapshots: number;
  episodes: number;
  dirty: number;
}> {
  if (!userId) return { snapshots: 0, episodes: 0, dirty: 0 };
  try {
    const [snapshots, episodes, dirty] = await Promise.all([
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_memory_state_snapshots WHERE user_id = $1`,
        [userId]
      ),
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_memory_episodes WHERE user_id = $1`,
        [userId]
      ),
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_memory_intelligence_dirty WHERE user_id = $1`,
        [userId]
      ),
    ]);
    return {
      snapshots: Number(snapshots.rows[0]?.n ?? 0),
      episodes: Number(episodes.rows[0]?.n ?? 0),
      dirty: Number(dirty.rows[0]?.n ?? 0),
    };
  } catch {
    return { snapshots: 0, episodes: 0, dirty: 0 };
  }
}
