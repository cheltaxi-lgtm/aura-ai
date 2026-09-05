import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bot, Context } from 'grammy';

const dataDir = mkdtempSync(join(tmpdir(), 'zovus-durable-recovery-'));
process.env.BOT_DATA_DIR = dataDir;
process.env.TELEGRAM_BOT_TOKEN = '123456:offline';
process.env.BOT_INTERNAL_SECRET = 'offline-test-secret';
const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw) as Record<string, unknown>;
  requests.push({ path: req.url!, body });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/internal/bot/resolve') {
    res.end(JSON.stringify({ ok: true, linked: true, accountId: 'account-test', profileUserId: 'profile-test', needsOnboarding: false, name: 'Test', runeBalance: 100 }));
  } else if (req.url === '/api/internal/bot/spread') {
    res.end(JSON.stringify({ ok: true, reading: 'Совет: OWNER_RESULT_SENTINEL. Двигайтесь спокойно.', cards: [], sessionId: 'session-test' }));
  } else if (req.url === '/api/internal/bot/numerology') {
    res.end(JSON.stringify({ ok: true, deleted: 1, cost: 90, runeBalance: 100, birthDate: '2000-01-02', subject: { id: body.subject_id, displayName: 'PERSON_A' } }));
  } else if (req.url === '/api/internal/bot/cabinet') {
    res.statusCode = 503;
    res.end(JSON.stringify({ ok: false, error: 'injected_cabinet_outage' }));
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'unexpected_offline_request' }));
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
process.env.SITE_INTERNAL_BASE_URL = `http://127.0.0.1:${address.port}`;

const { migrate, getDb } = await import('../../db/client.js');
const { migrateUp, ensureCriticalColumns } = await import('../../db/migrate-runner.js');
const { upsertUser, setFlow, getFlow, clearFlow } = await import('../../db/repos.js');
const { pendingOperation, userOperation, operationIdForIntent, recoverableOperations, savePaidResult } = await import('../paid-operation.js');
const { registerRecoveryFlows } = await import('../../flows/recovery.js');
const { handleMatrixCallback } = await import('../../flows/cabinet.js');
const { createMatrixView, activateReadingView } = await import('../reading/present.js');
const { handlePhotoText, handlePhotoCallback } = await import('../../flows/photo.js');
const { showProfile } = await import('../../flows/register.js');
migrate(); migrateUp(); ensureCriticalColumns();
const owner = 990301;
const stranger = 990302;
for (const id of [owner, stranger]) {
  upsertUser({ telegramUserId: id, chatId: id, firstName: 'Offline Test' });
  getDb().prepare(`UPDATE bot_users SET age_confirmed_at = ?, terms_accepted_at = ?, privacy_accepted_at = ? WHERE telegram_user_id = ?`)
    .run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), id);
}

function context(id: number, failReplies = 0) {
  const replies: string[] = [];
  const answers: Array<Record<string, unknown> | undefined> = [];
  const ctx = {
    from: { id }, chat: { id }, match: [] as string[],
    answerCallbackQuery: async (value?: Record<string, unknown>) => { answers.push(value); },
    replyWithChatAction: async () => true,
    reply: async (text: string) => {
      if (failReplies-- > 0) throw new Error('injected Telegram delivery failure');
      replies.push(text); return { message_id: replies.length, chat: { id } };
    },
  };
  return { ctx: ctx as unknown as Context, replies, answers };
}
type Callback = (ctx: Context) => Promise<void>;
let resume!: Callback;
registerRecoveryFlows({
  command: () => undefined,
  hears: () => undefined,
  callbackQuery: (pattern: string | RegExp, handler: Callback) => { if (pattern instanceof RegExp) resume = handler; },
} as unknown as Bot);
function resumeContext(id: number, operationId: string, failures = 0) {
  const value = context(id, failures);
  Object.assign(value.ctx, { match: [`op:resume:${operationId}`, operationId] });
  return value;
}

try {
  const failedInput = { subjectId: 'failed-free-matrix' };
  const failedFree = pendingOperation(owner, 'matrix', failedInput);
  savePaidResult(failedFree.id, { ok: false, error: 'operation_failed' });
  assert.equal(userOperation(owner, failedFree.id)?.status, 'failed');
  assert.notEqual(pendingOperation(owner, 'matrix', failedInput).id, failedFree.id,
    'a confirmed terminal failure allows a fresh explicit request instead of trapping every retry');
  const input = { question: 'Что поможет в работе?' };
  const operation = pendingOperation(owner, 'spread', input);
  getDb().prepare('UPDATE bot_paid_operations SET created_at = ?, updated_at = ? WHERE id = ?')
    .run('2020-01-01T23:59:59.000Z', '2020-01-01T23:59:59.000Z', operation.id);
  setFlow(owner, 'photo', 'await_photo', { question: 'Другой раздел' });
  clearFlow(owner);
  assert.equal(pendingOperation(owner, 'spread', input, randomUUID()).id, operation.id, 'navigation and day boundary retain the paid operation ID');
  assert.equal(operationIdForIntent(owner, 'fixed-intent'), operationIdForIntent(owner, 'fixed-intent'));
  assert.notEqual(operationIdForIntent(owner, 'fixed-intent'), operationIdForIntent(stranger, 'fixed-intent'));

  const denied = resumeContext(stranger, operation.id);
  await resume(denied.ctx);
  assert.match(denied.replies.join('\n'), /не найден/);
  assert.equal(requests.filter(r => r.path.endsWith('/spread')).length, 0, 'another owner cannot execute the operation');
  assert.equal(userOperation(stranger, operation.id), undefined);
  assert.equal(recoverableOperations(stranger).length, 0);

  const failingDelivery = resumeContext(owner, operation.id, 2);
  await resume(failingDelivery.ctx);
  assert.equal(userOperation(owner, operation.id)?.status, 'ready', 'result stays recoverable after HTML and plaintext delivery fail');
  assert.match(userOperation(owner, operation.id)?.result || '', /OWNER_RESULT_SENTINEL/);
  assert.match(failingDelivery.replies.join('\n'), /resume/);
  const recovered = resumeContext(owner, operation.id);
  await resume(recovered.ctx);
  assert.match(recovered.replies.join('\n'), /OWNER_RESULT_SENTINEL/);
  assert.equal(userOperation(owner, operation.id)?.status, 'delivered');
  const spreadRequests = requests.filter(r => r.path.endsWith('/spread'));
  assert.equal(spreadRequests.length, 1, 'cached recovery does not regenerate or submit another purchase');
  assert.equal(spreadRequests[0]!.body.client_event_id, operation.id);
  assert.notEqual(pendingOperation(owner, 'spread', input).id, operation.id, 'a new completed purchase gets a new operation ID');

  const viewA = createMatrixView(owner, 'subject-A', 'report-A');
  const viewB = createMatrixView(owner, 'subject-B', 'report-B');
  activateReadingView(owner, viewB);
  clearFlow(owner);
  const matrix = context(owner);
  await handleMatrixCallback(matrix.ctx, `mx:new:v:${viewA}`);
  const summary = requests.filter(r => r.path.endsWith('/numerology')).at(-1)!;
  assert.equal(summary.body.subject_id, 'subject-A');
  assert.match(matrix.replies.join('\n'), /PERSON_A/);
  activateReadingView(owner, viewB);
  await handleMatrixCallback(matrix.ctx, `mx:del:yes:v:${viewA}`);
  const deletion = requests.filter(r => r.path.endsWith('/numerology')).at(-1)!;
  assert.equal(deletion.body.action, 'delete');
  assert.equal(deletion.body.subject_id, 'subject-A');
  assert.equal(deletion.body.report_id, 'report-A');
  const beforeUnbound = requests.length;
  for (const action of ['mx:new', 'mx:new:yes', 'mx:del', 'mx:del:yes']) {
    const blocked = context(owner);
    assert.equal(await handleMatrixCallback(blocked.ctx, action), true);
    assert.equal(blocked.answers[0]?.show_alert, true);
  }
  await handleMatrixCallback(context(stranger).ctx, `mx:del:yes:v:${viewA}`);
  assert.equal(requests.length, beforeUnbound, 'unbound and foreign matrix buttons cannot call the bridge');

  const oldToken = randomUUID();
  const cards = [
    { name: 'Шут', reversed: false, position: 'Прошлое', confidence: 'medium' },
    { name: 'Маг', reversed: false, position: 'Настоящее', confidence: 'low', imagePath: '/old-card.png' },
    { name: 'Солнце', reversed: true, position: 'Будущее', confidence: 'high' },
  ];
  setFlow(owner, 'photo', 'edit_card', { question: input.question, characterId: 'veronika', cost: 30, idempotencyKey: oldToken, redrawSpread: { cards, spreadType: 'three' } });
  const photo = context(owner);
  assert.equal(await handlePhotoText(photo.ctx, '2 Луна перевёрнутая'), true);
  let flow = getFlow(owner)!;
  const edited = flow.data.redrawSpread as { cards: typeof cards; spreadType: string };
  assert.deepEqual(edited.cards[0], cards[0]);
  assert.deepEqual(edited.cards[2], cards[2]);
  assert.equal(edited.cards[1]!.name, 'Луна');
  assert.equal(edited.cards[1]!.reversed, true);
  assert.equal(edited.cards[1]!.position, cards[1]!.position);
  assert.equal(edited.cards[1]!.imagePath, undefined);
  assert.equal(edited.spreadType, 'three');
  assert.equal(flow.data.question, input.question);
  assert.notEqual(flow.data.idempotencyKey, oldToken);
  const beforeStale = JSON.stringify(flow);
  const requestCount = requests.length;
  await handlePhotoCallback(photo.ctx, `ph:ok:c:${oldToken}`);
  assert.equal(JSON.stringify(getFlow(owner)), beforeStale, 'stale confirmation does not mutate the current edited spread');
  assert.equal(requests.length, requestCount);
  assert.equal(photo.answers.at(-1)?.show_alert, true);
  setFlow(owner, 'photo', 'edit_card', flow.data);
  await handlePhotoText(photo.ctx, '2 Луна');
  flow = getFlow(owner)!;
  assert.equal((flow.data.redrawSpread as { cards: typeof cards }).cards[1]!.reversed, false, 'omitting reversed restores upright orientation');
  assert.equal(flow.data.question, input.question);
  getDb().prepare('UPDATE bot_users SET streak_days = 77 WHERE telegram_user_id = ?').run(owner);
  const profile = context(owner);
  Object.assign(profile.ctx, { replyWithChatAction: async () => { throw new Error('injected profile text fallback'); } });
  await showProfile(profile.ctx);
  const profileOutput = profile.replies.join('\n');
  assert.match(profileOutput, /Статистика временно недоступна/);
  assert.match(profileOutput, /Руны: 100/);
  assert.match(profileOutput, /Расклады: —/);
  assert.match(profileOutput, /Серия: 77 дн\./);
  assert.doesNotMatch(profileOutput, /Расклады: 0|С нами[^\n]*77|С нами с/);
  assert.ok(requests.some(r => r.path === '/api/internal/bot/cabinet'));
  assert.ok(requests.every(r => ['/api/internal/bot/resolve', '/api/internal/bot/spread', '/api/internal/bot/numerology', '/api/internal/bot/cabinet'].includes(r.path)));
  console.log('durable recovery PASS: stable retry, owner isolation, cached delivery, matrix binding, photo correction/stale token, honest partial profile outage');
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  getDb().close();
  rmSync(dataDir, { recursive: true, force: true });
}
