import type { Context, NextFunction } from 'grammy';

const active = new Map<number, number>();
export function hasActiveUserOperation(id: number): boolean { return (active.get(id) ?? 0) > 0; }

export async function withUserActivity<T>(id: number, work: () => Promise<T>): Promise<T> {
  active.set(id, (active.get(id) ?? 0) + 1);
  try { return await work(); }
  finally {
    const count = (active.get(id) ?? 1) - 1;
    if (count) active.set(id, count); else active.delete(id);
  }
}

/** Shared by webhook and polling so erasure cannot race a suspended handler. */
export async function userActivity(ctx: Context, next: NextFunction): Promise<void> {
  const id = ctx.from?.id;
  if (!id) return next();
  await withUserActivity(id, next);
}
