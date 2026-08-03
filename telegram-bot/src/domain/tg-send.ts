/**
 * Fast-fail Telegram media helpers.
 * On this VPS, undici+grammy sendPhoto can hang up to client timeout (was 60s)
 * and block the whole update — users see "подождите" forever.
 */
import type { Context } from "grammy";
import { InputFile } from "grammy";

const PHOTO_BUDGET_MS = 12_000;

function budget<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}

/** Send photo with a hard budget; returns false on timeout/error (does not throw). */
export async function replyPhotoBudget(
  ctx: Context,
  buf: Buffer,
  filename: string,
  opts?: { caption?: string; budgetMs?: number }
): Promise<boolean> {
  const ms = opts?.budgetMs ?? PHOTO_BUDGET_MS;
  try {
    await budget(
      ctx.replyWithPhoto(new InputFile(buf, filename), {
        caption: opts?.caption,
      }),
      ms,
      "sendPhoto"
    );
    return true;
  } catch (err) {
    console.error("[tg-send] photo skipped", err instanceof Error ? err.message : err);
    return false;
  }
}
