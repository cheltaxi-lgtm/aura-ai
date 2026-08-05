#!/usr/bin/env node
/**
 * Compare schema produced by `npm run migrate` on an empty DB vs `src/lib/schema.sql`.
 *
 * Creates two temporary databases on the same Postgres instance, dumps structural
 * metadata, prints diffs, exits 1 on any difference.
 *
 * Env: TEST_DATABASE_URL or DATABASE_URL (admin-capable user on that host).
 * Flags:
 *   --if-test-db  skip (exit 0) when TEST_DATABASE_URL is unset (for preflight)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SCHEMA_SQL_PATH = path.join(ROOT, "src/lib/schema.sql");
const MIGRATE_PATH = path.join(ROOT, "scripts/migrate.mjs");

const DB_MIG = "auraai_schema_diff_mig";
const DB_SQL = "auraai_schema_diff_sql";

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

function parseAdminUrl(urlString) {
  const u = new URL(urlString);
  const admin = new URL(urlString);
  admin.pathname = "/postgres";
  return { adminUrl: admin.toString(), user: decodeURIComponent(u.username) };
}

function dbUrl(baseUrl, dbName) {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function resetDatabase(admin, dbName) {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);
  await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
}

function quoteIdent(ident) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`Unsafe identifier: ${ident}`);
  }
  return `"${ident}"`;
}

/** Structural dump excluding migration ledger rows (table may exist only on migrate side). */
async function dumpSchema(client) {
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> 'schema_migrations'
    ORDER BY table_name
  `);

  const columns = await client.query(`
    SELECT table_name, column_name, data_type, udt_name,
           is_nullable, column_default, character_maximum_length,
           numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
    ORDER BY table_name, ordinal_position
  `);

  const indexes = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
    ORDER BY tablename, indexname
  `);

  const constraints = await client.query(`
    SELECT c.conname, c.contype, rel.relname AS table_name,
           pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname <> 'schema_migrations'
    ORDER BY rel.relname, c.conname
  `);

  const enums = await client.query(`
    SELECT t.typname AS enum_name,
           string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `);

  return {
    tables: tables.rows.map((r) => r.table_name),
    columns: columns.rows.map(
      (r) =>
        `${r.table_name}.${r.column_name}|${r.data_type}|${r.udt_name}|null=${r.is_nullable}|def=${r.column_default ?? ""}|len=${r.character_maximum_length ?? ""}|p=${r.numeric_precision ?? ""}|s=${r.numeric_scale ?? ""}`
    ),
    indexes: indexes.rows.map(
      (r) => `${r.tablename}|${r.indexname}|${normalizeSql(r.indexdef)}`
    ),
    constraints: constraints.rows.map(
      (r) => `${r.table_name}|${r.conname}|${r.contype}|${normalizeSql(r.def)}`
    ),
    enums: enums.rows.map((r) => `${r.enum_name}=${r.labels}`),
  };
}

function normalizeSql(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

function diffSets(label, a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyMig = [...setA].filter((x) => !setB.has(x));
  const onlySql = [...setB].filter((x) => !setA.has(x));
  if (!onlyMig.length && !onlySql.length) return [];
  const lines = [`[${label}]`];
  for (const x of onlyMig) lines.push(`  only-in-migrations: ${x}`);
  for (const x of onlySql) lines.push(`  only-in-schema.sql: ${x}`);
  return lines;
}

async function main() {
  loadEnvFile(".env.test");
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const args = new Set(process.argv.slice(2));
  const optional = args.has("--if-test-db");
  const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!baseUrl?.trim()) {
    if (optional) {
      console.log(
        "[schema:diff] skipped — TEST_DATABASE_URL / DATABASE_URL not set"
      );
      return;
    }
    console.error(
      "schema:diff requires TEST_DATABASE_URL or DATABASE_URL (local Postgres)"
    );
    process.exit(1);
  }

  const lower = baseUrl.toLowerCase();
  if (
    lower.includes("prod") ||
    lower.includes("beget") ||
    lower.includes("zovus.ru")
  ) {
    console.error("Refusing schema:diff against a production-looking URL");
    process.exit(1);
  }

  if (!fs.existsSync(SCHEMA_SQL_PATH)) {
    throw new Error(`Missing ${SCHEMA_SQL_PATH}`);
  }

  const { adminUrl } = parseAdminUrl(baseUrl);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();

  try {
    console.log(`[schema:diff] reset ${DB_MIG}, ${DB_SQL}`);
    await resetDatabase(admin, DB_MIG);
    await resetDatabase(admin, DB_SQL);

    const migUrl = dbUrl(baseUrl, DB_MIG);
    const sqlUrl = dbUrl(baseUrl, DB_SQL);

    console.log("[schema:diff] migrate → empty DB");
    execFileSync(process.execPath, [MIGRATE_PATH], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: migUrl },
      stdio: "inherit",
    });

    console.log("[schema:diff] schema.sql → empty DB");
    const sqlClient = new pg.Client({ connectionString: sqlUrl });
    await sqlClient.connect();
    try {
      await sqlClient.query(fs.readFileSync(SCHEMA_SQL_PATH, "utf8"));
    } finally {
      await sqlClient.end();
    }

    const migClient = new pg.Client({ connectionString: migUrl });
    const sqlClient2 = new pg.Client({ connectionString: sqlUrl });
    await migClient.connect();
    await sqlClient2.connect();
    let dumpMig;
    let dumpSql;
    try {
      dumpMig = await dumpSchema(migClient);
      dumpSql = await dumpSchema(sqlClient2);
    } finally {
      await migClient.end();
      await sqlClient2.end();
    }

    const diffs = [
      ...diffSets("tables", dumpMig.tables, dumpSql.tables),
      ...diffSets("columns", dumpMig.columns, dumpSql.columns),
      ...diffSets("indexes", dumpMig.indexes, dumpSql.indexes),
      ...diffSets("constraints", dumpMig.constraints, dumpSql.constraints),
      ...diffSets("enums", dumpMig.enums, dumpSql.enums),
    ];

    if (diffs.length) {
      console.error("\nSchema drift detected:\n");
      console.error(diffs.join("\n"));
      console.error(`\n${diffs.filter((l) => l.startsWith("  ")).length} difference(s).`);
      process.exit(1);
    }

    console.log(
      `[schema:diff] OK — migrations and schema.sql match (${dumpMig.tables.length} tables)`
    );
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error("schema:diff failed:", err.message ?? err);
  process.exit(1);
});
