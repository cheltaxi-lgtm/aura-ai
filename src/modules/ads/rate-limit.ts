/** Simple in-memory IP rate limit for /api/ads/t and /api/ads/e. */
const hits = new Map<string, { n: number; reset: number }>();

export function rateLimitIp(
  ip: string,
  limit = 60,
  windowMs = 60_000
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || cur.reset < now) {
    hits.set(ip, { n: 1, reset: now + windowMs });
    return { ok: true };
  }
  cur.n += 1;
  if (cur.n > limit) {
    return { ok: false, retryAfterSec: Math.ceil((cur.reset - now) / 1000) };
  }
  return { ok: true };
}
