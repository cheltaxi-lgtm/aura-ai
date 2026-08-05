#!/usr/bin/env node
/**
 * Idempotent SQL migration runner.
 *
 * Usage:
 *   node scripts/migrate.mjs           — apply pending migrations
 *   node scripts/migrate.mjs --baseline — mark historical files through 063 as applied
 *   node scripts/migrate.mjs --status   — list applied / pending
 *
 * Empty database: applies src/lib/schema.sql (canonical snapshot through
 * SCHEMA_SQL_THROUGH), records those migrations in schema_migrations, then
 * runs any newer files. Historical 001–063 never CREATE core tables (sessions
 * etc.); they are ALTER-only and cannot bootstrap alone.
 *
 * Env: DATABASE_URL (from .env.local or environment)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const SCHEMA_SQL_PATH = path.join(ROOT, "src/lib/schema.sql");

// Existing databases predate the migration ledger. Only migrations known to
// have been represented by the historical schema may be baselined without
// executing SQL. Never advance this cutoff for a newly shipped migration.
const BASELINE_MAX_VERSION = 63;

/**
 * src/lib/schema.sql is hand-maintained as a full snapshot of the schema after
 * this migration number (inclusive). Bump when schema.sql absorbs a new file.
 */
// Snapshot includes product schema through 100; 101+ always execute as SQL
// (idempotent) so empty-DB migrate still exercises the newest align migration.
const SCHEMA_SQL_THROUGH = 100;

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

function loadEnvFile(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    // Rollback companions (*.down.sql) are manual only — never auto-apply.
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function ensureMigrationsTable(client) {
  await client.query(SCHEMA_MIGRATIONS_DDL);
}

async function getAppliedVersions(client) {
  const { rows } = await client.query(
    "SELECT version FROM schema_migrations ORDER BY version ASC"
  );
  return new Set(rows.map((r) => r.version));
}

async function isDatabaseInitialized(client) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sessions'
    ) AS ready
  `);
  return Boolean(rows[0]?.ready);
}

function migrationNumber(file) {
  const match = /^(\d+)_/.exec(file);
  return match ? Number.parseInt(match[1], 10) : null;
}

function baselineFiles(files) {
  return files.filter((file) => {
    const version = migrationNumber(file);
    return version !== null && version <= BASELINE_MAX_VERSION;
  });
}

function schemaSnapshotFiles(files) {
  return files.filter((file) => {
    const version = migrationNumber(file);
    return version !== null && version <= SCHEMA_SQL_THROUGH;
  });
}

/**
 * Migrations that fail when schema.sql (final shape) is applied first, then
 * migrate runs protected pending files. Safe to record as applied: target
 * objects already exist in the snapshot / later migrations.
 */
function isSchemaFirstSatisfiedFailure(file, errMsg) {
  const msg = String(errMsg ?? "");
  if (
    file.startsWith("072_migrate_numerology_report_history") &&
    /no unique or exclusion constraint matching the ON CONFLICT/i.test(msg)
  ) {
    return true;
  }
  if (
    file.startsWith("077_migrate_premium_ai_delivery") &&
    /operator does not exist: uuid/i.test(msg)
  ) {
    return true;
  }
  return false;
}

async function markVersions(client, files, label) {
  let inserted = 0;
  for (const file of files) {
    const { rowCount } = await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [file]
    );
    if (rowCount) {
      inserted++;
      console.log(`[${label}] marked ${file}`);
    }
  }
  return inserted;
}

async function markBaseline(client, files) {
  await ensureMigrationsTable(client);
  const historical = baselineFiles(files);
  const inserted = await markVersions(client, historical, "baseline");
  const protectedPending = files.filter(
    (file) => !historical.includes(file)
  );
  const applied = await getAppliedVersions(client);
  const stillPending = protectedPending.filter((f) => !applied.has(f));
  console.log(
    `Baseline complete: ${inserted} historical migration(s) recorded (cutoff ${String(BASELINE_MAX_VERSION).padStart(3, "0")}).`
  );
  if (stillPending.length > 0) {
    console.log(
      `Protected pending migrations require SQL execution: ${stillPending.join(", ")}`
    );
  }
}

async function bootstrapEmptyFromSchemaSql(client, files) {
  if (!fs.existsSync(SCHEMA_SQL_PATH)) {
    throw new Error(`schema.sql not found: ${SCHEMA_SQL_PATH}`);
  }
  console.log(
    `[bootstrap] empty database — applying src/lib/schema.sql (snapshot through ${String(SCHEMA_SQL_THROUGH).padStart(3, "0")})`
  );
  const sql = fs.readFileSync(SCHEMA_SQL_PATH, "utf8");
  await client.query(sql);

  const snapshot = schemaSnapshotFiles(files);
  const inserted = await markVersions(client, snapshot, "bootstrap");
  console.log(
    `[bootstrap] recorded ${inserted} migration(s) as applied (schema.sql snapshot).`
  );
  const pending = files.filter((f) => !snapshot.includes(f));
  if (pending.length) {
    console.log(`[bootstrap] pending after snapshot: ${pending.join(", ")}`);
  }
}

async function runMigrations(client, files, applied) {
  let ran = 0;
  let softSkipped = 0;
  // Mutate a working set so soft-skips are visible to later iterations.
  const seen = new Set(applied);

  for (const file of files) {
    if (seen.has(file)) {
      console.log(`[skip] ${file}`);
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`[run]  ${file}`);

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      ran++;
      seen.add(file);
      console.log(`[ok]   ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      if (isSchemaFirstSatisfiedFailure(file, err.message)) {
        console.warn(
          `[skip-satisfied] ${file}: ${err.message} (schema already at target; recording ledger)`
        );
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
          [file]
        );
        softSkipped++;
        seen.add(file);
        continue;
      }
      console.error(`[fail] ${file}`);
      throw err;
    }
  }
  return { ran, softSkipped };
}

async function printStatus(client, files, applied) {
  console.log("Migration status:");
  for (const file of files) {
    console.log(`  ${applied.has(file) ? "✓" : "·"} ${file}`);
  }
  const pending = files.filter((f) => !applied.has(f)).length;
  console.log(
    `Applied: ${applied.size}, pending: ${pending}, total: ${files.length}`
  );
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const dbUrl =
    process.env.DATABASE_URL ??
    "postgresql://auraai:auraai_secret@localhost:5432/auraai";

  const args = new Set(process.argv.slice(2));
  const baseline = args.has("--baseline");
  const statusOnly = args.has("--status");

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.error("No .sql files in scripts/migrations/");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    let applied = await getAppliedVersions(client);

    if (statusOnly) {
      await printStatus(client, files, applied);
      return;
    }

    if (baseline) {
      await markBaseline(client, files);
      applied = await getAppliedVersions(client);
      const { ran } = await runMigrations(client, files, applied);
      console.log(`Done: ${ran} protected pending migration(s) applied.`);
      return;
    }

    // Truly empty DB: cannot run 001+ (ALTER-only). Bootstrap from schema.sql.
    if (applied.size === 0 && !(await isDatabaseInitialized(client))) {
      await bootstrapEmptyFromSchemaSql(client, files);
      applied = await getAppliedVersions(client);
      const { ran, softSkipped } = await runMigrations(client, files, applied);
      console.log(
        `Done: ${ran} migration(s) applied after bootstrap` +
          (softSkipped ? `, ${softSkipped} skip-satisfied` : "") +
          `.`
      );
      return;
    }

    if (
      applied.size === 0 &&
      files.length > 0 &&
      (await isDatabaseInitialized(client)) &&
      !args.has("--force")
    ) {
      console.log(
        `Existing database with empty schema_migrations — baselining historical migrations through ${String(BASELINE_MAX_VERSION).padStart(3, "0")} (use --force to re-apply all).`
      );
      await markBaseline(client, files);
      applied = await getAppliedVersions(client);
      const { ran, softSkipped } = await runMigrations(client, files, applied);
      console.log(
        `Done: ${ran} protected pending migration(s) applied` +
          (softSkipped ? `, ${softSkipped} skip-satisfied` : "") +
          `.`
      );
      return;
    }

    const { ran, softSkipped } = await runMigrations(client, files, applied);
    console.log(
      `Done: ${ran} migration(s) applied` +
        (softSkipped ? `, ${softSkipped} skip-satisfied` : "") +
        `, ledger size now tracked in schema_migrations.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message ?? err);
  process.exit(1);
});
