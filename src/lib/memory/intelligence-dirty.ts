/**
 * Lightweight dirty marker for Memory Intelligence rebuild.
 * Isolated from user-facts to avoid circular imports.
 * Fail-safe: missing table / DB errors never throw to the write path.
 */
import { query } from "@/lib/db";

export async function markUserMemoryIntelligenceDirty(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO user_memory_intelligence_dirty (user_id, dirty_at, attempts, last_error, processing_at)
       VALUES ($1, NOW(), 0, NULL, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         dirty_at = NOW(),
         last_error = NULL,
         processing_at = NULL`,
      [userId]
    );
  } catch {
    /* V3 write path must keep working if derived tables are unavailable. */
  }
}

export async function claimDirtyIntelligenceUsers(limit = 10): Promise<string[]> {
  const cap = Math.min(50, Math.max(1, limit));
  try {
    const { rows } = await query<{ user_id: string }>(
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
      RETURNING user_id`,
      [cap]
    );
    return rows.map((row) => row.user_id);
  } catch {
    return [];
  }
}

export async function clearUserMemoryIntelligenceDirty(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await query(`DELETE FROM user_memory_intelligence_dirty WHERE user_id = $1`, [userId]);
  } catch {
    /* ignore */
  }
}

export async function failUserMemoryIntelligenceDirty(userId: string): Promise<void> {
  if (!userId) return;
  try {
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
