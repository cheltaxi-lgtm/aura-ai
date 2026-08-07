/**
 * DB harness for P0 invariant tests.
 * Requires TEST_DATABASE_URL (see .env.test.example). Never targets prod.
 *
 * Bootstrap: honest migrate.mjs only. On an empty DB the runner applies
 * src/lib/schema.sql as a snapshot through SCHEMA_SQL_THROUGH (currently 100),
 * then executes newer migrations (101+) — no harness-side ledger forging.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { hasTestDb } from "./setup-env";

export { hasTestDb };

const ROOT = path.resolve(__dirname, "../../..");

/** Tables touched by guest-resume / billing invariant fixtures — keep explicit. */
export const INVARIANT_TABLES = [
  "rune_transactions",
  "sessions",
  "users",
  "user_accounts",
] as const;

let migratePromise: Promise<void> | null = null;

export function assertSafeTestDatabaseUrl(url: string): void {
  const lower = url.toLowerCase();
  if (!url.trim()) {
    throw new Error("TEST_DATABASE_URL is empty");
  }
  if (
    lower.includes("prod") ||
    lower.includes("beget") ||
    lower.includes("zovus.ru")
  ) {
    throw new Error(
      "Refusing TEST_DATABASE_URL: looks like a production host (prod/beget/zovus.ru)"
    );
  }
}

async function resetTestDatabase(url: string): Promise<void> {
  // Broken ledger (e.g. 109 before hd_charts) — wipe public schema and
  // re-bootstrap from schema.sql. Never used against prod (assertSafe*).
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO public");
  } finally {
    await client.end();
  }
}

export async function ensureTestDbMigrated(): Promise<void> {
  if (!hasTestDb) return;
  if (!migratePromise) {
    migratePromise = (async () => {
      const url = process.env.TEST_DATABASE_URL!.trim();
      assertSafeTestDatabaseUrl(url);
      process.env.DATABASE_URL = url;

      const runMigrate = () =>
        execFileSync(process.execPath, [path.join(ROOT, "scripts/migrate.mjs")], {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: url },
          stdio: "pipe",
        });

      try {
        runMigrate();
      } catch (err) {
        const msg = String(
          (err as { stderr?: Buffer; message?: string }).stderr?.toString?.() ||
            (err as Error).message ||
            err
        );
        // Recover empty/broken test DB when HD tables are missing mid-ledger.
        if (/hd_charts|relation .* does not exist/i.test(msg)) {
          await resetTestDatabase(url);
          runMigrate();
          return;
        }
        throw err;
      }
    })().catch((err) => {
      migratePromise = null;
      throw err;
    });
  }
  await migratePromise;
}

export async function truncateInvariantTables(): Promise<void> {
  if (!hasTestDb) return;
  const { getPool } = await import("@/lib/db");
  const pool = getPool();
  const list = INVARIANT_TABLES.join(", ");
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function closeTestPool(): Promise<void> {
  if (!hasTestDb) return;
  try {
    const { getPool } = await import("@/lib/db");
    await getPool().end();
  } catch {
    /* pool may not have been created */
  }
}

/** Wire lifecycle for a describe that needs the test DB. */
export function installDbLifecycle() {
  beforeAll(async () => {
    await ensureTestDbMigrated();
  }, 180_000);

  beforeEach(async () => {
    await truncateInvariantTables();
  });

  afterAll(async () => {
    // Do not pool.end() here — vitest runs files in parallel and shares getPool().
  });
}
