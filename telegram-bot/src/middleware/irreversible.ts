import type { Context } from "grammy";

const flags = new WeakMap<object, boolean>();

/** Mark that this update already performed a non-rollbackable side effect. */
export function markIrreversible(ctx: Context): void {
  flags.set(ctx, true);
}

export function isIrreversible(ctx: Context): boolean {
  return flags.get(ctx) === true;
}
