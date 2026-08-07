import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type { PoolClient };

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    // Worker process: prefer DB_POOL_MAX_WORKER (default 5 on run-async-jobs)
    // so long report jobs cannot exhaust the Next.js pool.
    // pending Phase 0 calibration
    const workerMax = Number(process.env.DB_POOL_MAX_WORKER);
    const appMax = Number(process.env.DB_POOL_MAX);
    const isAsyncWorker =
      typeof process.argv[1] === "string" && process.argv[1].includes("run-async-jobs");
    const max =
      Number.isFinite(workerMax) && workerMax >= 1
        ? Math.floor(workerMax)
        : isAsyncWorker
          ? 5
          : Math.max(1, Number.isFinite(appMax) && appMax >= 1 ? Math.floor(appMax) : 20);
    pool = new Pool({
      connectionString,
      max,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ssl:
        process.env.DATABASE_SSL === "require"
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
          : undefined,
    });
    // A one-shot `pool.query(SET ...)` only affects the single connection it
    // borrows, not every physical connection the pool later opens (up to
    // `max`). Apply session GUCs on every new connection instead so they
    // reliably hold for the pool's whole lifetime.
    pool.on("connect", (client) => {
      // Sequential on purpose: parallel unawaited client.query() calls on the
      // same connection trigger a pg deprecation warning (and each GUC must
      // fail independently — e.g. hnsw.* doesn't exist without pgvector).
      void (async () => {
        // Optional — some hosts restrict SET.
        await client.query("SET statement_timeout = '30s'").catch(() => {});
        // pgvector HNSW filtered search (e.g. `WHERE user_id = $1 ORDER BY
        // embedding <=> $2 LIMIT n`) can under-return once user_facts grows to
        // many users' vectors mixed in one index, because the ANN walk isn't
        // scoped to the filter. Iterative scan (pgvector >= 0.8) keeps walking
        // until enough post-filter matches are found. No-op / harmless on older
        // pgvector — the GUC simply won't exist and this fails silently.
        await client.query("SET hnsw.iterative_scan = relaxed_order").catch(() => {});
        // Belt-and-braces for the same filtered-HNSW under-return problem on
        // installs where iterative_scan is unavailable: widen the candidate
        // list the ANN walk considers (default 40). Costs a little CPU per
        // vector query; user_facts queries are low-QPS background/prompt work.
        await client.query("SET hnsw.ef_search = 100").catch(() => {});
      })();
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

export async function queryClient<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  params?: unknown[]
) {
  return client.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDb(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
