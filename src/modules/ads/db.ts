/**
 * Isolated DB access for Ads Autopilot.
 * Mutating queries must target ads.* only (runtime guard).
 * Read-only SELECT against public.* is allowed for conversion collectors.
 */
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let adsPool: Pool | null = null;

function connectionString(): string {
  const url = process.env.ADS_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("ADS_DATABASE_URL or DATABASE_URL is not set");
  return url;
}

export function getAdsPool(): Pool {
  if (!adsPool) {
    adsPool = new Pool({
      connectionString: connectionString(),
      max: Math.max(1, Number(process.env.ADS_DB_POOL_MAX) || 5),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ssl:
        process.env.DATABASE_SSL === "require"
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
          : undefined,
    });
  }
  return adsPool;
}

const MUTATING = /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i;

/** Reject mutating SQL that touches non-ads relations. */
export function assertAdsMutationAllowed(text: string): void {
  if (!MUTATING.test(text)) return;
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  // ON CONFLICT ... DO UPDATE SET is not a table UPDATE — strip before matching.
  const forGuard = stripped.replace(
    /\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\b/gi,
    " /* upsert */ "
  );
  // Allow CREATE/ALTER only inside ads. during tests — runtime app code should not DDL.
  const touchesNonAds =
    /\b(INTO|UPDATE|FROM|TABLE)\s+(?!SET\b)(?!ads\.)([a-z_][a-z0-9_]*)/i.test(forGuard) ||
    /\bpublic\./i.test(forGuard);
  // INTO ads.click OK; INTO users FAIL
  const intoMatch = forGuard.match(/\bINTO\s+([a-z_][a-z0-9_.]*)/gi) || [];
  const updateMatch = forGuard.match(/\bUPDATE\s+(?!SET\b)([a-z_][a-z0-9_.]*)/gi) || [];
  const deleteMatch = forGuard.match(/\bDELETE\s+FROM\s+([a-z_][a-z0-9_.]*)/gi) || [];
  const targets = [...intoMatch, ...updateMatch, ...deleteMatch].map((m) =>
    m.replace(/^(INTO|UPDATE|DELETE\s+FROM)\s+/i, "").toLowerCase()
  );
  for (const t of targets) {
    if (!t.startsWith("ads.")) {
      throw new Error(`ADS_DB_GUARD: mutating query outside ads schema: ${t}`);
    }
  }
  if (touchesNonAds && targets.length === 0 && !/\bads\./i.test(forGuard)) {
    throw new Error("ADS_DB_GUARD: mutating query must reference ads.*");
  }
}

export async function adsQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  assertAdsMutationAllowed(text);
  return getAdsPool().query<T>(text, params);
}

/** Explicit read-only query against public (or join) — never mutating. */
export async function adsReadOnlyPublic<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (MUTATING.test(text)) {
    throw new Error("ADS_DB_GUARD: adsReadOnlyPublic forbids mutating SQL");
  }
  return getAdsPool().query<T>(text, params);
}

export async function withAdsTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getAdsPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function adsClientQuery<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  assertAdsMutationAllowed(text);
  return client.query<T>(text, params);
}
