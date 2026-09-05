import assert from 'node:assert/strict';
import type { Context } from 'grammy';
import { createUserQueue, UserQueueFullError } from '../user-queue.js';

const ctx = (id: number) => ({ from: { id } } as Context);
let release!: () => void;
const held = new Promise<void>(r => { release = r; });
const queue = createUserQueue(2, 3);
const events: string[] = [];
let erasing = false;
const first = queue(ctx(1), async () => { events.push('first'); await held; });
const second = queue(ctx(1), async () => { events.push(erasing ? 'erasure-rejected' : 'unsafe'); });
await assert.rejects(queue(ctx(1), async () => { throw new Error('overload executed'); }), UserQueueFullError);
await queue(ctx(2), async () => { events.push('other-user'); });
assert.deepEqual(events, ['first', 'other-user']);
erasing = true; release();
await Promise.all([first, second]);
assert.deepEqual(events, ['first', 'other-user', 'erasure-rejected']);
await assert.rejects(queue(ctx(1), async () => { throw new Error('handler-failed'); }), /handler-failed/);
await queue(ctx(1), async () => { events.push('after-failure'); });
assert.equal(events.at(-1), 'after-failure');

let unblock!: () => void;
const blocker = new Promise<void>(r => { unblock = r; });
const bounded = createUserQueue(10, 1);
const active = bounded(ctx(3), async () => { await blocker; });
await assert.rejects(bounded(ctx(4), async () => undefined), UserQueueFullError);
unblock(); await active;
await bounded(ctx(4), async () => undefined);

let rejectedInvoice = false;
await bounded({ preCheckoutQuery: {}, answerPreCheckoutQuery: async (ok: boolean) => { rejectedInvoice = !ok; } } as unknown as Context,
  async () => { throw new Error('invoice reached paid flow'); });
assert.equal(rejectedInvoice, true);
console.log('user queue: PASS (ordering, independent users, erasure recheck, overload, failure release, invoice deadline)');
