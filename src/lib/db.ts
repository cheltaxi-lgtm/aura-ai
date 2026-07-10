import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type { PoolClient };

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      max: Math.max(1, Number(process.env.DB_POOL_MAX) || 20),
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
      client.query("SET statement_timeout = '30s'").catch(() => {
        /* optional — some hosts restrict SET */
      });
      // pgvector HNSW filtered search (e.g. `WHERE user_id = $1 ORDER BY
      // embedding <=> $2 LIMIT n`) can under-return once user_facts grows to
      // many users' vectors mixed in one index, because the ANN walk isn't
      // scoped to the filter. Iterative scan (pgvector >= 0.8) keeps walking
      // until enough post-filter matches are found. No-op / harmless on older
      // pgvector — the GUC simply won't exist and this fails silently.
      client.query("SET hnsw.iterative_scan = relaxed_order").catch(() => {
        /* older pgvector without iterative scan support — ignore */
      });
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
