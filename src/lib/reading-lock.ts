import { Pool } from "pg";
import { getPool } from "@/lib/db";

let lockPool: Pool | undefined;

function getLockPool(): Pool {
  // Long-running readings use the normal pool inside their callbacks. A separate
  // pool prevents lock waiters from exhausting those query connections.
  if (!lockPool) {
    const normalOptions = getPool().options;
    const configuredMax = Number(process.env.DB_READING_LOCK_POOL_MAX);
    lockPool = new Pool({
      ...normalOptions,
      max: Number.isInteger(configuredMax) && configuredMax >= 4
        ? configuredMax
        : Math.max(4, normalOptions.max ?? 20),
      connectionTimeoutMillis: 30_000,
      statement_timeout: 30_000,
      allowExitOnIdle: true,
    });
    lockPool.on("error", (error) => {
      console.error("[reading-lock] idle connection failed", error.message);
    });
  }
  return lockPool;
}

/** A session advisory lock must be acquired and released on the same connection. */
export async function withReadingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const client = await getLockPool().connect();
  let acquired = false;
  let discard = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
    acquired = true;
    return await fn();
  } finally {
    if (acquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
      } catch {
        // Closing the backend also releases any lock whose unlock failed.
        discard = true;
      }
    } else {
      discard = true;
    }
    client.release(discard);
  }
}
