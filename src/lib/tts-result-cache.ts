/**
 * Short-lived server cache for TTS audio so charge idempotency does not
 * re-hit the speech provider on double-submit (Capacitor / flaky networks).
 * TTL aligns with CHARGE_IDEM_WINDOW_SEC (billing fallback window).
 */

export type CachedTtsResult = {
  buffer: Buffer;
  contentType: string;
  provider: string;
  model?: string;
  parts?: Buffer[];
};

type Entry = { result: CachedTtsResult; expiresAt: number };

const store = new Map<string, Entry>();

/** Keep in sync with billing CHARGE_IDEM_WINDOW_SEC (seconds). */
export const TTS_RESULT_CACHE_TTL_MS = 30_000;

export function ttsResultCacheKey(userId: string, idempotencyKey: string): string {
  return `${userId}::${idempotencyKey}`;
}

export function setTtsResultCache(key: string, result: CachedTtsResult): void {
  const now = Date.now();
  pruneTtsResultCache(now);
  store.set(key, { result, expiresAt: now + TTS_RESULT_CACHE_TTL_MS });
}

export function getTtsResultCache(key: string): CachedTtsResult | null {
  const now = Date.now();
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function clearTtsResultCacheForTests(): void {
  store.clear();
}

function pruneTtsResultCache(now: number) {
  if (store.size < 64) return;
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}
