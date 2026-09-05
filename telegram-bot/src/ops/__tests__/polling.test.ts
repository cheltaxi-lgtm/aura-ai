import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { Update } from 'grammy/types';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.BOT_DATA_DIR = mkdtempSync(join(tmpdir(), 'zovus-polling-test-'));
process.env.TELEGRAM_BOT_TOKEN = '123456:offline';
const { getDb, migrate } = await import('../../db/client.js');
const { ensureCriticalColumns, migrateUp } = await import('../../db/migrate-runner.js');
const { acceptUpdates, pollingOffset, preparePollingInbox, runDurablePolling } = await import('../polling.js');
const { claimUpdate, completeUpdate, markUpdateIrreversible, deleteUserData } = await import('../../db/repos.js');
const { userActivity, hasActiveUserOperation } = await import('../../middleware/activity.js');

getDb().exec(`CREATE TABLE bot_processed_updates (update_id INTEGER PRIMARY KEY, processed_at TEXT NOT NULL);
  INSERT INTO bot_processed_updates VALUES (999, '2020-01-01T00:00:00.000Z')`);
migrate(); migrateUp(); ensureCriticalColumns(); preparePollingInbox();
assert(!claimUpdate(999), 'upgraded legacy completion markers must not be reclaimed');
function reset() {
  getDb().exec('DELETE FROM bot_update_inbox; DELETE FROM bot_polling_cursor; DELETE FROM bot_processed_updates');
}
function update(id: number, user = id): Update {
  return { update_id: id, message: { message_id: id, date: 0, text: 'test',
    from: { id: user, first_name: 'Test', is_bot: false }, chat: { id: user, type: 'private', first_name: 'Test' } } };
}
async function until(fn: () => boolean) {
  for (let i = 0; i < 200; i++) { if (fn()) return; await delay(10); }
  assert.fail('condition timed out');
}

// B arrives through a later fetch while A remains blocked; same-user A2 waits.
reset();
{
  const abort = new AbortController();
  const seen: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0, running = 0, max = 0;
  const task = runDurablePolling({
    fetch: async offset => {
      calls++;
      if (offset === 0) return [update(1, 10), update(2, 10)];
      if (offset === 3) return [update(3, 20), update(4, 30)];
      return [];
    },
    handle: async u => {
      seen.push(u.update_id); running++; max = Math.max(max, running);
      if (u.update_id === 1) await gate;
      running--;
    },
  }, abort.signal, 2);
  try {
    await until(() => seen.includes(3) && seen.includes(4));
    assert(!seen.includes(2), 'per-user second update must wait for first');
    assert(calls >= 2); assert.equal(pollingOffset(), 5); assert(max <= 2);
    release(); await until(() => seen.includes(2));
  } finally { release(); abort.abort(); await task; }
}

// Durable restart: acceptance survives process recreation and advances fetch
// offset only together with persisted payloads; completed/irreversible never replay.
reset();
{
  acceptUpdates([update(10), update(11), update(12)]);
  assert.equal(pollingOffset(), 13);
  assert(claimUpdate(10)); completeUpdate(10);
  assert(claimUpdate(11)); markUpdateIrreversible(11);
  const abort = new AbortController(); const handled: number[] = [];
  const task = runDurablePolling({
    fetch: async offset => { assert.equal(offset, 13); return []; },
    handle: async u => { handled.push(u.update_id); },
  }, abort.signal);
  try {
    await until(() => handled.length > 0);
    assert.deepEqual(handled, [12]);
    const review = getDb().prepare('SELECT status, payload FROM bot_update_inbox WHERE update_id = 11').get();
    assert.equal(review?.status, 'needs_review'); assert.equal(review?.payload, '{}');
  } finally { abort.abort(); await task; }
}

// Persistence failure cannot move cursor or retain half a batch.
reset();
getDb().exec(`CREATE TRIGGER fail_polling_test BEFORE INSERT ON bot_update_inbox
  WHEN NEW.update_id = 22 BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
try {
  assert.throws(() => acceptUpdates([update(21), update(22)]), /injected failure/);
  assert.equal(pollingOffset(), 0);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM bot_update_inbox').get()?.n, 0);
} finally { getDb().exec('DROP TRIGGER fail_polling_test'); }

// Shutdown drains started work; unstarted same-user work survives for restart.
reset();
{
  acceptUpdates([update(31, 30), update(32, 30)]);
  const abort = new AbortController(); let started = false; let drained = false;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const task = runDurablePolling({ fetch: async () => [], handle: async () => { started = true; await gate; } }, abort.signal)
    .then(() => { drained = true; });
  await until(() => started);
  abort.abort(); await delay(70); assert(!drained);
  release(); await task;
  assert.equal(getDb().prepare(`SELECT status FROM bot_update_inbox WHERE update_id = 32`).get()?.status, 'queued');
}
reset();
{
  acceptUpdates([update(900, 900)]);
  deleteUserData(900);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM bot_update_inbox').get()?.n, 0, 'account erasure purges queued payload');
  getDb().prepare('UPDATE bot_polling_cursor SET last_accepted_at = ?').run(new Date(Date.now() - 7 * 86_400_000).toISOString());
  assert.equal(pollingOffset(), 0, 'offset resets before Telegram random update ID generation');
  acceptUpdates([update(100, 100)]);
  assert.equal(pollingOffset(), 101, 'random lower ID becomes new cursor');
}
reset();
{
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const task = userActivity({ from: { id: 808 } } as never, async () => { await gate; });
  assert(hasActiveUserOperation(808), 'webhook and polling work both fence erasure');
  release(); await task;
  assert(!hasActiveUserOperation(808));
}
{
  const abort = new AbortController(); let fetching = false; let cancelled = false;
  const task = runDurablePolling({
    fetch: async (_offset, signal) => {
      fetching = true;
      return new Promise<Update[]>((resolve) => signal.addEventListener('abort', () => { cancelled = true; resolve([]); }, { once: true }));
    },
    handle: async () => undefined,
  }, abort.signal);
  await until(() => fetching);
  getDb().exec('DROP TABLE bot_update_inbox');
  await assert.rejects(task, /bot_update_inbox/);
  assert(cancelled, 'dispatcher failure must abort producer before awaiting it');
  preparePollingInbox();
}
reset();
console.log('polling PASS: cross-user responsiveness, ordering, concurrency, durable restart, atomic acceptance, shutdown drain');
