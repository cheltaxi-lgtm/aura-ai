import type { Context, NextFunction } from 'grammy';
import { getDb, nowIso } from '../db/client.js';
import { deleteUserData } from '../db/repos.js';
import { hasActiveUserOperation } from '../middleware/activity.js';
import { hasActivePollingUser } from '../ops/polling.js';
import { erasedUpdate } from './erasure-policy.js';

export function isUserErasing(id: number): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM bot_user_erasure
    WHERE telegram_user_id = ? AND status != 'completed' LIMIT 1`).get(id));
}

export function beginUserErasure(id: number, operation: string): boolean {
  // A persisted fence survives a crash and blocks new user work before purge.
  getDb().prepare(`INSERT OR IGNORE INTO bot_user_erasure
    (operation_id, telegram_user_id, created_at) VALUES (?, ?, ?)`).run(operation, id, nowIso());
  const row = getDb().prepare(`SELECT status FROM bot_user_erasure
    WHERE operation_id = ? AND telegram_user_id = ?`).get(operation, id) as { status: string };
  // Delayed retries of an old operation must never erase a newly created account.
  if (row.status === 'purged' || row.status === 'completed') return true;
  if (hasActiveUserOperation(id) || hasActivePollingUser(id)) return false;
  // The optional reminder runner is a separate process: its SQL delivery lease
  // is visible here even though its in-memory activity registry is not.
  if (getDb().prepare(`SELECT 1 FROM bot_reminder_delivery WHERE telegram_user_id = ?
    AND state = 'sending' AND updated_at > ? LIMIT 1`).get(id, Date.now() - 30_000)) return false;
  deleteUserData(id);
  getDb().prepare(`UPDATE bot_user_erasure SET status = 'purged'
    WHERE operation_id = ? AND telegram_user_id = ?`).run(operation, id);
  return true;
}

export function completeUserErasure(id: number, operation: string): boolean {
  const row = getDb().prepare(`SELECT status FROM bot_user_erasure
    WHERE operation_id = ? AND telegram_user_id = ?`).get(operation, id) as { status: string } | undefined;
  if (!row || row.status === 'pending') return false;
  if (row.status === 'completed') return true;
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM bot_update_inbox WHERE user_key = ?').run(String(id));
    db.prepare(`UPDATE bot_user_erasure SET status = 'completed', completed_at = COALESCE(completed_at, ?)
      WHERE operation_id = ? AND telegram_user_id = ?`).run(nowIso(), operation, id);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return true;
}

export async function erasureGate(ctx: Context, next: NextFunction): Promise<void> {
  if (!ctx.from) return next();
  const reason = erasedUpdate(ctx.from.id, ctx.update);
  if (!reason) return next();
  const text = reason === 'pending'
    ? 'Удаление аккаунта выполняется. Дождитесь завершения — новые действия пока недоступны.'
    : 'Прежний аккаунт удалён. Для нового начала отправьте /start. Старые кнопки больше не действуют.';
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text }).catch(() => undefined);
  else await ctx.reply(text).catch(() => undefined);
}
