import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, migrate as ensureBaseline, nowIso } from "./client.js";
import { EXPECTED_TABLES, additiveColumns } from "./expected-schema.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function ensureMigrationsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS bot_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function applied(): Set<string> {
  ensureMigrationsTable();
  const rows = getDb()
    .prepare(`SELECT id FROM bot_schema_migrations`)
    .all() as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

function listUp(): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

/** Strip -- comments so a comment line never swallows the next ALTER. */
function statements(sql: string): string[] {
  const withoutLineComments = sql
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return "";
      const idx = line.indexOf("--");
      if (idx >= 0) return line.slice(0, idx);
      return line;
    })
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "SELECT 1");
}

export function migrateUp(): string[] {
  ensureBaseline();
  ensureMigrationsTable();
  const done = applied();
  const appliedNow: string[] = [];
  for (const file of listUp()) {
    const id = file.replace(/\.sql$/, "");
    if (done.has(id)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    for (const stmt of statements(sql)) {
      try {
        getDb().exec(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate column|already exists/i.test(msg)) continue;
        throw err;
      }
    }
    getDb()
      .prepare(`INSERT OR IGNORE INTO bot_schema_migrations (id, applied_at) VALUES (?, ?)`)
      .run(id, nowIso());
    appliedNow.push(id);
  }
  return appliedNow;
}

export function migrateDown(): string[] {
  ensureMigrationsTable();
  const rows = getDb()
    .prepare(`SELECT id FROM bot_schema_migrations ORDER BY id DESC`)
    .all() as Array<{ id: string }>;
  if (!rows.length) return [];
  const last = rows[0].id;
  const downFile = `${last}.down.sql`;
  try {
    const sql = readFileSync(join(dir, downFile), "utf8");
    for (const stmt of statements(sql)) {
      getDb().exec(stmt);
    }
  } catch {
    // no down file / noop
  }
  getDb().prepare(`DELETE FROM bot_schema_migrations WHERE id = ?`).run(last);
  return [last];
}

/**
 * Safety net driven by EXPECTED_TABLES / additiveColumns().
 * Creates missing tables and ADD COLUMN for missing additive columns.
 */
export function ensureCriticalColumns(): void {
  const db = getDb();

  for (const table of EXPECTED_TABLES) {
    if (table.createSql) {
      try {
        db.exec(table.createSql);
      } catch (err) {
        console.error(`[schema] create ${table.name}`, err);
      }
    }
  }

  for (const { table, column } of additiveColumns()) {
    const cols = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
    if (cols.has(column.name)) continue;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.sqlType}`);
      console.log(`[schema] added ${table}.${column.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column|already exists/i.test(msg)) continue;
      console.error(`[schema] ${table}.${column.name}`, err);
    }
  }
}

/** Diff actual DB columns vs EXPECTED_TABLES (missing only). */
export function schemaGaps(): Array<{ table: string; missing: string[] }> {
  const db = getDb();
  const gaps: Array<{ table: string; missing: string[] }> = [];
  for (const table of EXPECTED_TABLES) {
    let cols: Set<string>;
    try {
      cols = new Set(
        (db.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>).map(
          (c) => c.name
        )
      );
    } catch {
      gaps.push({ table: table.name, missing: table.columns.map((c) => c.name) });
      continue;
    }
    const missing = table.columns.map((c) => c.name).filter((n) => !cols.has(n));
    if (missing.length) gaps.push({ table: table.name, missing });
  }
  return gaps;
}
