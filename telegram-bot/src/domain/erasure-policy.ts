import type { Update } from 'grammy/types';
import { getDb } from '../db/client.js';

/** This policy also runs before durable inbox storage, so erased PII is not re-ingested. */
export function erasedUpdate(id: number, update: Update): 'pending' | 'stale' | 'restart' | null {
  const rows = getDb().prepare(`SELECT status, completed_at FROM bot_user_erasure WHERE telegram_user_id = ?`).all(id) as { status: string; completed_at: string | null }[];
  if (rows.some(r => r.status !== 'completed')) return 'pending';
  const cutoff = Math.max(0, ...rows.map(r => Date.parse(r.completed_at || '') || 0));
  if (!cutoff) return null;
  const message = update.message || update.edited_message || update.callback_query?.message;
  if (message?.date && message.date * 1000 <= cutoff) return 'stale';
  const hasUser = getDb().prepare('SELECT 1 FROM bot_users WHERE telegram_user_id = ?').get(id);
  if (!hasUser && !/^\/start(?:@\w+)?(?:\s|$)/.test(update.message?.text || '')) return 'restart';
  return null;
}
