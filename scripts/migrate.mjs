#!/usr/bin/env node
/**
 * Idempotent SQL migration runner.
 *
 * Usage:
 *   node scripts/migrate.mjs           — apply pending migrations
 *   node scripts/migrate.mjs --baseline — mark all files as applied (existing DB, no SQL)
 *   node scripts/migrate.mjs --status   — list applied / pending
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
    .filter((f) => f.endsWith(".sql"))
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

async function markBaseline(client, files) {
  await ensureMigrationsTable(client);
  const applied = await getAppliedVersions(client);
  let inserted = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [file]
    );
    inserted++;
    console.log(`[baseline] marked ${file}`);
  }
  console.log(`Baseline complete: ${inserted} migration(s) recorded.`);
}

async function runMigrations(client, files, applied) {
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[skip] ${file}`);
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`[run]  ${file}`);

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran++;
      console.log(`[ok]   ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[fail] ${file}`);
      throw err;
    }
  }
  return ran;
}

async function printStatus(client, files, applied) {
  console.log("Migration status:");
  for (const file of files) {
    console.log(`  ${applied.has(file) ? "✓" : "·"} ${file}`);
  }
  const pending = files.filter((f) => !applied.has(f)).length;
  console.log(`Applied: ${applied.size}, pending: ${pending}, total: ${files.length}`);
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
    const applied = await getAppliedVersions(client);

    if (statusOnly) {
      await printStatus(client, files, applied);
      return;
    }

    if (baseline) {
      await markBaseline(client, files);
      return;
    }

    if (
      applied.size === 0 &&
      files.length > 0 &&
      (await isDatabaseInitialized(client)) &&
      !args.has("--force")
    ) {
      console.log(
        "Existing database with empty schema_migrations — baselining (use --force to re-apply all)."
      );
      await markBaseline(client, files);
      return;
    }

    const ran = await runMigrations(client, files, applied);
    console.log(`Done: ${ran} migration(s) applied, ${files.length - ran - applied.size + ran} already up to date.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message ?? err);
  process.exit(1);
});
