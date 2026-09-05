import { getDb } from './client.js';

/** Bounded operational history; saved purchases and unresolved operations are never expired here. */
export function purgeOperationalHistory(now = Date.now()): number {
  const db = getDb();
  const cutoff = new Date(now - 90 * 86_400_000).toISOString();
  const day = cutoff.slice(0, 10);
  const claimDay = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10);
  const viewCutoff = new Date(now - 30 * 86_400_000).toISOString();
  let removed = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [sql, value] of [
      ['DELETE FROM bot_events WHERE created_at < ?', cutoff],
      ['DELETE FROM bot_day_cards WHERE day < ?', day],
      ['DELETE FROM bot_reminder_log WHERE created_at < ?', cutoff],
      ['DELETE FROM bot_spread_claims WHERE local_date < ?', claimDay],
      ['DELETE FROM bot_llm_usage WHERE day < ?', day],
      ['DELETE FROM bot_tts_usage WHERE day < ?', day],
      ['DELETE FROM bot_reading_views WHERE updated_at < ?', viewCutoff],
    ]) removed += Number(db.prepare(sql!).run(value!).changes);
    removed += Number(db.prepare(`DELETE FROM bot_reminder_delivery WHERE state != 'sending' AND suppress_until < ?`).run(now - 90 * 86_400_000).changes);
    db.exec('COMMIT');
    return removed;
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}
