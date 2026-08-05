/**
 * Isolated DB access for Zovus Pro.
 * Mutating queries must target pro.* only (runtime guard).
 */
import { Pool, type QueryResult, type QueryResultRow } from "pg";

let proPool: Pool | null = null;

function connectionString(): string {
  const url = process.env.PRO_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("PRO_DATABASE_URL or DATABASE_URL is not set");
  return url;
}

export function getProPool(): Pool {
  if (!proPool) {
    proPool = new Pool({
      connectionString: connectionString(),
      max: Math.max(1, Number(process.env.PRO_DB_POOL_MAX) || 5),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ssl:
        process.env.DATABASE_SSL === "require"
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
          : undefined,
    });
  }
  return proPool;
}

const MUTATING = /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i;

/** Reject mutating SQL that touches non-pro relations. */
export function assertProMutationAllowed(text: string): void {
  if (!MUTATING.test(text)) return;
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
  const onConflictUpdate = /\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\b/i.test(stripped);
  const cleaned = onConflictUpdate
    ? stripped.replace(/\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\b/gi, " ")
    : stripped;
  if (!/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE)\b/i.test(cleaned)) {
    return;
  }
  // Allow only pro.<table> (and CREATE SCHEMA pro).
  const touchesForeign =
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\s+(?!pro\.)/i.test(
      cleaned
    ) || /\bREFERENCES\s+(?!pro\.)/i.test(cleaned);
  if (touchesForeign) {
    throw new Error("pro db guard: mutating SQL must target pro.* only");
  }
}

export async function proQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  assertProMutationAllowed(text);
  return getProPool().query<T>(text, params);
}
