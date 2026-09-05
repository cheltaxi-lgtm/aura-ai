import { createHash, randomUUID } from 'node:crypto';
import { getDb, nowIso } from '../db/client.js';

export type PaidOperation = { id: string; telegram_user_id: number; kind: string; input: string; status: string; result: string | null };
export function operationIdForIntent(tid: number, intent: string): string {
  const h = createHash('sha256').update(`${tid}:${intent}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function pendingOperation(tid: number, kind: string, input: Record<string, unknown>, legacyId?: string): PaidOperation {
  const json = JSON.stringify(input);
  const hash = createHash('sha256').update(json).digest('hex');
  const prior = getDb().prepare(`SELECT * FROM bot_paid_operations
    WHERE telegram_user_id = ? AND kind = ? AND input_hash = ? AND status IN ('pending', 'ready')
    ORDER BY created_at DESC LIMIT 1`).get(tid, kind, hash) as PaidOperation | undefined;
  if (prior) return prior;
  const legacy = legacyId ? userOperation(tid, legacyId) : undefined;
  if (legacy && legacy.kind === kind && legacy.input === json && legacy.status !== 'failed') return legacy;
  const id = !legacy && legacyId && /^[a-f0-9-]{36}$/i.test(legacyId) ? legacyId : randomUUID(); const now = nowIso();
  getDb().prepare(`INSERT INTO bot_paid_operations
    (id, telegram_user_id, kind, input_hash, input, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tid, kind, hash, json, now, now);
  return { id, telegram_user_id: tid, kind, input: json, status: 'pending', result: null };
}
export function savePaidResult(id: string, result: { ok: boolean; error?: string; pending?: boolean; refunded?: boolean }): void {
  const terminal = ['insufficient_runes', 'refunded', 'not_found', 'not_available', 'operation_failed', 'operation_required', 'invalid_request', 'invalid_question', 'invalid_spread'];
  const status = result.ok && !result.pending ? 'ready' : result.refunded || terminal.includes(result.error || '') ? 'failed' : 'pending';
  getDb().prepare(`UPDATE bot_paid_operations SET result = ?, status = ?, updated_at = ? WHERE id = ?`)
    .run(status === 'ready' ? JSON.stringify(result) : null, status, nowIso(), id);
}
export function deliveredOperation(id: string): void {
  getDb().prepare(`UPDATE bot_paid_operations SET status = 'delivered', updated_at = ? WHERE id = ? AND status = 'ready'`).run(nowIso(), id);
}
export function userOperation(tid: number, id: string): PaidOperation | undefined {
  return getDb().prepare('SELECT * FROM bot_paid_operations WHERE id = ? AND telegram_user_id = ?').get(id, tid) as PaidOperation | undefined;
}
export function recoverableOperations(tid: number): PaidOperation[] {
  return getDb().prepare(`SELECT * FROM bot_paid_operations WHERE telegram_user_id = ? AND status IN ('pending','ready') ORDER BY created_at DESC LIMIT 10`).all(tid) as PaidOperation[];
}
