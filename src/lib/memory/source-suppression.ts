import { queryClient, type PoolClient } from "@/lib/db";

/** Call under the same user memory lock as the write or forget transaction. */
export async function isMemorySourceSuppressed(client: PoolClient, userId: string, sourceId?: string | null): Promise<boolean> {
  if (!sourceId) return false;
  const { rows } = await queryClient(client,
    "SELECT 1 FROM user_memory_source_suppressions WHERE user_id = $1 AND source_entity_id = $2",
    [userId, sourceId]);
  return rows.length > 0;
}
