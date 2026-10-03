import { withTransaction, type PoolClient } from "@/lib/db";

/** Serialize a bounded data operation with accepted account erasure. Never
 * hold this lock across a provider/network request or a user-row update. */
export async function withActiveProfile<T>(userId: string, operation: (client: PoolClient) => Promise<T>): Promise<T | null> {
  return withTransaction(async (client) => {
    const active = await client.query(
      `SELECT id FROM users WHERE id = $1 AND erasure_requested_at IS NULL FOR SHARE`, [userId]
    );
    if (!active.rows[0]) return null;
    return operation(client);
  });
}
