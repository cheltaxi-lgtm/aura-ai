import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Update } from 'grammy/types';

const dataDir = mkdtempSync(join(tmpdir(), 'zovus-erasure-replay-'));
process.env.BOT_DATA_DIR = dataDir;
process.env.TELEGRAM_BOT_TOKEN = '123456:offline';
const { migrate, getDb } = await import('../../db/client.js');
const { migrateUp, ensureCriticalColumns } = await import('../../db/migrate-runner.js');
const { upsertUser, getUser, setFlow, getFlow } = await import('../../db/repos.js');
const { beginUserErasure, completeUserErasure } = await import('../user-erasure.js');
const { erasedUpdate } = await import('../erasure-policy.js');
const { pendingOperation, userOperation } = await import('../paid-operation.js');
const { acceptUpdates, pollingOffset, preparePollingInbox } = await import('../../ops/polling.js');
migrate(); migrateUp(); ensureCriticalColumns(); preparePollingInbox();
const owner = 990401;
const operation = randomUUID();
function update(id: number, text: string, old = false): Update {
  return { update_id: id, message: { message_id: id, from: { id: owner, is_bot: false, first_name: 'Private Name' }, chat: { id: owner, type: 'private', first_name: 'Private Name' }, date: Math.floor(Date.now() / 1000) + (old ? -60 : 2), text } };
}
function inboxCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM bot_update_inbox WHERE user_key = ?').get(String(owner)) as { n: number }).n;
}
try {
  upsertUser({ telegramUserId: owner, chatId: owner, firstName: 'Before deletion' });
  acceptUpdates([update(10, 'private queued request')]);
  assert.equal(inboxCount(), 1);
  assert.equal(beginUserErasure(owner, operation), true);
  assert.equal(getUser(owner), null);
  assert.equal(inboxCount(), 0);
  const fenced = update(11, 'private text during erasure');
  assert.equal(erasedUpdate(owner, fenced), 'pending');
  acceptUpdates([fenced]);
  assert.equal(inboxCount(), 0, 'accepted updates during the fence must not store PII');
  assert.equal(pollingOffset(), 12, 'dropped erased updates are still acknowledged to Telegram');
  getDb().prepare('INSERT INTO bot_update_inbox (update_id, user_key, payload, received_at) VALUES (?, ?, ?, ?)')
    .run(12, String(owner), JSON.stringify(update(12, 'late in-flight payload')), new Date().toISOString());
  assert.equal(completeUserErasure(owner, randomUUID()), false);
  assert.equal(completeUserErasure(owner, operation), true);
  assert.equal(inboxCount(), 0, 'completion repurges any late durable inbox payload');
  assert.equal(erasedUpdate(owner, update(13, 'old command', true)), 'stale');
  assert.equal(erasedUpdate(owner, update(14, 'new ordinary command')), 'restart');
  assert.equal(erasedUpdate(owner, update(15, '/start')), null);
  acceptUpdates([update(13, 'old private text', true), update(14, 'restart required'), update(15, '/start')]);
  assert.equal(inboxCount(), 1);
  assert.equal(pollingOffset(), 16);

  upsertUser({ telegramUserId: owner, chatId: owner, firstName: 'New account' });
  setFlow(owner, 'photo', 'await_photo', { question: 'New account question' });
  const purchase = pendingOperation(owner, 'spread', { question: 'New account purchase' });
  assert.equal(beginUserErasure(owner, operation), true);
  assert.equal(completeUserErasure(owner, operation), true);
  assert.ok(getUser(owner), 'a delayed old begin must not purge the recreated account');
  assert.equal(getFlow(owner)?.data.question, 'New account question');
  assert.equal(userOperation(owner, purchase.id)?.status, 'pending');
  assert.equal(inboxCount(), 1, 'a delayed completed operation must not purge new account work');
  assert.equal(erasedUpdate(owner, update(16, 'new valid request')), null);
  console.log('erasure replay PASS: fence drops PII/advances cursor, completion purge, stale restart policy, delayed-operation isolation');
} finally {
  getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
}
