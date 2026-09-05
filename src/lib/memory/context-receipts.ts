import { query, queryClient } from "@/lib/db";
import type { UserFact } from "@/lib/memory/user-facts";
import { readMemoryWriteConsent, withUserMemoryLock } from "@/lib/memory/write-guard";
import { MEMORY_PRODUCT_LABELS } from "@/lib/memory/presentation";

export async function saveMemoryContextReceipt(params: {
  userId: string; sessionId?: string | null; product?: string | null;
  generation?: string; facts: UserFact[];
}): Promise<void> {
  const product = params.product && MEMORY_PRODUCT_LABELS[params.product] ? params.product : "chat";
  const key = params.sessionId ?? `product:${product}`;
  await withUserMemoryLock(params.userId, async (client) => {
    const consent = await readMemoryWriteConsent(params.userId, client);
    if (!consent?.memoryEnabled || consent.generation !== params.generation) return;
    if (params.sessionId) {
      const { rows } = await queryClient(client, `SELECT id FROM sessions WHERE id=$1 AND user_id=$2 AND COALESCE(memory_read_mode,'default')='default'`, [params.sessionId, params.userId]);
      if (!rows.length) return;
    }
    if (!params.facts.length) {
      await queryClient(client, `DELETE FROM user_memory_context_receipts WHERE user_id=$1 AND context_key=$2`, [params.userId, key]);
      return;
    }
    await queryClient(client, `INSERT INTO user_memory_context_receipts
      (user_id, context_key, session_id, product, fact_versions, capture_generation)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::bigint)
      ON CONFLICT (user_id, context_key) DO UPDATE SET fact_versions=EXCLUDED.fact_versions,
        product=EXCLUDED.product, capture_generation=EXCLUDED.capture_generation, prepared_at=NOW()`,
      [params.userId, key, params.sessionId ?? null, product,
        JSON.stringify(params.facts.map(f => ({ id: f.id, updatedAt: f.updatedAt ?? null }))), consent.generation]);
    await queryClient(client, `DELETE FROM user_memory_context_receipts WHERE user_id=$1 AND context_key IN (
      SELECT context_key FROM user_memory_context_receipts WHERE user_id=$1 ORDER BY prepared_at DESC OFFSET 100)`, [params.userId]);
  });
}

export async function listMemoryContextReceipts(userId: string, sessionId?: string | null) {
  const { rows } = await query<{
    context_key: string; product: string; prepared_at: Date; fact_versions: Array<{ id: string; updatedAt: string | null }>;
  }>(`SELECT r.context_key, r.product, r.prepared_at, r.fact_versions FROM user_memory_context_receipts r
    JOIN user_memory_preferences p ON p.user_id=r.user_id AND p.memory_enabled AND p.capture_generation=r.capture_generation
    WHERE r.user_id=$1 AND ($2::uuid IS NULL OR r.session_id=$2::uuid)
      AND (r.session_id IS NULL OR EXISTS (SELECT 1 FROM sessions s WHERE s.id=r.session_id AND s.user_id=$1 AND COALESCE(s.memory_read_mode,'default')='default'))
      AND r.prepared_at > NOW() - INTERVAL '30 days'
    ORDER BY r.prepared_at DESC LIMIT 6`, [userId, sessionId ?? null]);
  const ids = rows.flatMap(r => r.fact_versions.map(f => f.id));
  if (!ids.length) return [];
  const facts = await query<{ id: string; fact: string; source_type: string | null; updated_at: Date; source_captured_at: Date | null }>(
    `SELECT id,fact,source_type,updated_at,source_captured_at FROM user_facts WHERE user_id=$1 AND id=ANY($2::uuid[]) AND status IN ('active','superseded')`, [userId, ids]);
  return rows.map(row => ({
    id: row.context_key, product: row.product, preparedAt: row.prepared_at.toISOString(),
    facts: row.fact_versions.flatMap(version => {
      const fact = facts.rows.find(f => f.id === version.id && f.updated_at.toISOString() === version.updatedAt);
      return fact ? [{ id: fact.id, fact: fact.fact, sourceType: fact.source_type, sourceCapturedAt: fact.source_captured_at?.toISOString() ?? null }] : [];
    }),
  })).filter(row => row.facts.length > 0);
}
