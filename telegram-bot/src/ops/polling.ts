import { setTimeout as delay } from 'node:timers/promises';
import type { Update } from 'grammy/types';
import { getDb } from '../db/client.js';
import { setRuntimeHealth } from './runtime-health.js';
import { erasedUpdate } from '../domain/erasure-policy.js';

type InboxRow = { update_id: number; user_key: string; payload: string };
const activeUsers = new Set<string>();
export function hasActivePollingUser(userId: number): boolean { return activeUsers.has(String(userId)); }
export function pollingQueueStats() {
  const rows = getDb().prepare(`SELECT status, COUNT(*) AS n FROM bot_update_inbox GROUP BY status`).all() as { status: string; n: number }[];
  return { active: activeUsers.size, queued: rows.find(r => r.status === 'queued')?.n ?? 0,
    needsReview: rows.find(r => r.status === 'needs_review')?.n ?? 0 };
}
export interface PollingTransport {
  fetch(offset: number, signal: AbortSignal): Promise<Update[]>;
  handle(update: Update): Promise<void>;
}

/** Durable acceptance precedes acknowledgement to Telegram. */
export function preparePollingInbox(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS bot_update_inbox (
      update_id INTEGER PRIMARY KEY, user_key TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bot_update_inbox_queue ON bot_update_inbox(status, update_id);
    CREATE TABLE IF NOT EXISTS bot_polling_cursor (id INTEGER PRIMARY KEY CHECK(id = 1), offset INTEGER NOT NULL, last_accepted_at TEXT NOT NULL);
  `);
}

function userKey(update: Update): string {
  const value = Object.values(update).find(v => v && typeof v === 'object') as
    { from?: { id: number }; chat?: { id: number }; message?: { chat?: { id: number } } } | undefined;
  return String(value?.from?.id ?? value?.chat?.id ?? value?.message?.chat?.id ?? `update:${update.update_id}`);
}

export function acceptUpdates(updates: Update[]): void {
  if (!updates.length) return;
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare(`INSERT OR IGNORE INTO bot_update_inbox
      (update_id, user_key, payload, received_at) VALUES (?, ?, ?, ?)`);
    for (const update of updates) {
      const key = userKey(update);
      // A pending purge still acknowledges Telegram's cursor but stores no payload.
      if (erasedUpdate(Number(key), update)) continue;
      insert.run(update.update_id, key, JSON.stringify(update), new Date().toISOString());
    }
    db.prepare(`INSERT INTO bot_polling_cursor (id, offset, last_accepted_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET offset = excluded.offset, last_accepted_at = excluded.last_accepted_at`)
      .run(Math.max(...updates.map(u => u.update_id)) + 1, new Date().toISOString());
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function pollingOffset(): number {
  const cursor = getDb().prepare('SELECT offset, last_accepted_at FROM bot_polling_cursor WHERE id = 1').get() as
    { offset: number; last_accepted_at: string } | undefined;
  // Telegram randomizes update IDs after >=7 days without updates. Reset the
  // fetch offset beforehand; accepted payloads stay safely in the local inbox.
  return cursor && Date.parse(cursor.last_accepted_at) > Date.now() - 6 * 86_400_000 ? cursor.offset : 0;
}

/** Per-user ordering with bounded work and a bounded durable backlog. */
export async function runDurablePolling(
  transport: PollingTransport,
  signal: AbortSignal,
  concurrency = 8,
): Promise<void> {
  preparePollingInbox();
  const stop = new AbortController();
  const runSignal = AbortSignal.any([signal, stop.signal]);
  const active = new Map<string, Promise<void>>();
  const limit = Math.max(1, Math.min(32, Math.trunc(concurrency) || 8));
  let fetchFailed = false;
  let fatal: unknown;
  let lastMaintenance = 0;
  const fetchLoop = (async () => {
    while (!runSignal.aborted && !fetchFailed) {
      if (Date.now() - lastMaintenance > 60_000) {
        lastMaintenance = Date.now();
        // Expired commands need review, not an automatic purchase days later.
        getDb().prepare(`UPDATE bot_update_inbox SET status = 'needs_review', payload = '{}'
          WHERE status = 'queued' AND received_at < ?`)
          .run(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
        getDb().prepare(`DELETE FROM bot_update_inbox WHERE status = 'needs_review' AND received_at < ?`)
          .run(new Date(Date.now() - 7 * 86_400_000).toISOString());
      }
      const queued = getDb().prepare(`SELECT COUNT(*) AS n FROM bot_update_inbox WHERE status = 'queued'`).get() as { n: number };
      if (queued.n >= 1000) { await delay(100); continue; }
      let updates: Update[];
      try {
        updates = await transport.fetch(pollingOffset(), runSignal);
        setRuntimeHealth({ lastTransportSuccessAt: Date.now() });
      }
      catch (err) {
        if (runSignal.aborted) break;
        setRuntimeHealth({ lastTransportErrorAt: Date.now() });
        console.error('[polling] fetch failed', err instanceof Error ? err.message : 'transport error');
        await delay(1000);
        continue;
      }
      // Persistence failure is fatal: never acknowledge a batch we could not save.
      acceptUpdates(updates);
      if (!updates.length) await delay(100);
    }
  })().catch(err => { fatal = err; fetchFailed = true; });
  try {
    while (!signal.aborted && !fetchFailed) {
      // Earliest queued item per user avoids hot-user head-of-line blocking.
      const rows = getDb().prepare(`SELECT q.update_id, q.user_key, q.payload
        FROM bot_update_inbox q WHERE q.status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM bot_update_inbox earlier
          WHERE earlier.status = 'queued' AND earlier.user_key = q.user_key AND earlier.update_id < q.update_id)
        ORDER BY q.update_id LIMIT 1000`).all() as InboxRow[];
      for (const row of rows) {
        if (active.size >= limit || signal.aborted) break;
        if (active.has(row.user_key)) continue;
        const claim = getDb().prepare('SELECT status, processed_at FROM bot_processed_updates WHERE update_id = ?')
          .get(row.update_id) as { status: string; processed_at: string } | undefined;
        if (claim?.status === 'processing' && Date.parse(claim.processed_at) > Date.now() - 15 * 60_000) continue;
        if (claim?.status === 'completed' || claim?.status === 'irreversible') {
          if (claim.status === 'completed') getDb().prepare('DELETE FROM bot_update_inbox WHERE update_id = ?').run(row.update_id);
          else getDb().prepare(`UPDATE bot_update_inbox SET status = 'needs_review', payload = '{}' WHERE update_id = ?`).run(row.update_id);
          continue;
        }
        activeUsers.add(row.user_key);
        const task = (async () => {
          try {
            await transport.handle(JSON.parse(row.payload) as Update);
            getDb().prepare('DELETE FROM bot_update_inbox WHERE update_id = ?').run(row.update_id);
          } catch (err) {
            // No automatic replay after an unknown handler outcome. Preserve only
            // the update ID for operations review, not the user's message body.
            getDb().prepare(`UPDATE bot_update_inbox SET status = 'needs_review', payload = '{}' WHERE update_id = ?`).run(row.update_id);
            console.error('[polling] update failed', row.update_id, err instanceof Error ? err.message : 'handler error');
          }
        })().catch(err => { fatal = err; fetchFailed = true; }).finally(() => {
          active.delete(row.user_key); activeUsers.delete(row.user_key);
        });
        active.set(row.user_key, task);
      }
      await delay(50);
    }
  } finally {
    stop.abort();
    await Promise.all(active.values());
    await fetchLoop;
  }
  if (fatal) throw fatal;
}
