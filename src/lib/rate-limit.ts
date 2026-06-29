import { ensureDb, query } from "@/lib/db";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

const MEMORY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function purgeExpiredMemoryBuckets(now = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of memoryBuckets) {
    if (now >= bucket.resetAt) {
      memoryBuckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function ensureMemoryBucketJanitor(): void {
  if (typeof setInterval === "undefined") return;
  const g = globalThis as typeof globalThis & { __rateLimitMemoryJanitor?: boolean };
  if (g.__rateLimitMemoryJanitor) return;
  g.__rateLimitMemoryJanitor = true;

  const timer = setInterval(() => {
    purgeExpiredMemoryBuckets();
  }, MEMORY_SWEEP_INTERVAL_MS);

  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
}

ensureMemoryBucketJanitor();

/** Returns true if allowed, false if rate limited. */
export function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true };
}

async function checkRateLimitPg(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const windowSec = Math.ceil(windowMs / 1000);
  const { rows } = await query<{ allowed: boolean; retry_after_sec: number | null }>(
    `WITH upsert AS (
       INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
       VALUES ($1, 1, NOW() + ($3 || ' seconds')::INTERVAL)
       ON CONFLICT (bucket_key) DO UPDATE SET
         count = CASE
           WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
           ELSE rate_limit_buckets.count + 1
         END,
         reset_at = CASE
           WHEN rate_limit_buckets.reset_at <= NOW() THEN NOW() + ($3 || ' seconds')::INTERVAL
           ELSE rate_limit_buckets.reset_at
         END
       RETURNING count, reset_at
     )
     SELECT
       (SELECT count FROM upsert) <= $2 AS allowed,
       GREATEST(0, EXTRACT(EPOCH FROM ((SELECT reset_at FROM upsert) - NOW()))::INT) AS retry_after_sec`,
    [key, limit, String(windowSec)]
  );

  const row = rows[0];
  if (!row) return { allowed: true };
  if (row.allowed) return { allowed: true };
  return {
    allowed: false,
    retryAfterSec: row.retry_after_sec ?? windowSec,
  };
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const failClosed = process.env.NODE_ENV === "production";

  if (await ensureDb()) {
    try {
      return await checkRateLimitPg(key, limit, windowMs);
    } catch (err) {
      console.warn("PG rate limit fallback to memory:", err);
      if (failClosed) {
        return { allowed: false, retryAfterSec: Math.ceil(windowMs / 1000) };
      }
    }
  } else if (failClosed) {
    return { allowed: false, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  return checkRateLimitMemory(key, limit, windowMs);
}

export function rateLimitKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}
