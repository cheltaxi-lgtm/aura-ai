import type { Context, NextFunction } from 'grammy';

export class UserQueueFullError extends Error {
  constructor() { super('User update queue is full; retry this update later'); }
}

/** Serialize stateful flows across webhook requests, before claiming an update.
 * A rejected request has no side effects and the HTTP adapter returns a retryable
 * error. Every admitted waiter runs downstream erasure/auth gates after waiting.
 */
export function createUserQueue(maxPerUser = 50, maxTotal = 1000) {
  const lanes = new Map<number, { tail: Promise<void>; count: number }>();
  let total = 0;
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const uid = ctx.from?.id;
    // Retired Stars invoices must be rejected before Telegram's short deadline.
    if (ctx.preCheckoutQuery) {
      await ctx.answerPreCheckoutQuery(false, 'Оплата Stars отключена. Купите руны картой в боте.');
      return;
    }
    if (!uid) return next();
    const lane = lanes.get(uid) ?? { tail: Promise.resolve(), count: 0 };
    if (lane.count >= maxPerUser || total >= maxTotal) throw new UserQueueFullError();
    const prior = lane.tail;
    let release!: () => void;
    lane.tail = new Promise<void>(resolve => { release = resolve; });
    lane.count++; total++; lanes.set(uid, lane);
    try {
      await prior;
      await next();
    } finally {
      lane.count--; total--; release();
      if (!lane.count) lanes.delete(uid);
    }
  };
}

export const userQueue = createUserQueue();
