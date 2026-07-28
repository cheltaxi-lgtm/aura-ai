import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, migrate as ensureBaseline, nowIso } from "./client.js";

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

/** Safety net: add critical columns if a prior buggy migrate skipped them. */
export function ensureCriticalColumns(): void {
  const db = getDb();
  const userCols = new Set(
    (db.prepare(`PRAGMA table_info(bot_users)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  const sessionCols = new Set(
    (db.prepare(`PRAGMA table_info(bot_guest_sessions)`).all() as Array<{ name: string }>).map(
      (c) => c.name
    )
  );

  const userNeed: Array<[string, string]> = [
    ["timezone_offset_minutes", "INTEGER"],
    ["consent_version", "TEXT"],
    ["voice_mode", "TEXT"],
    ["ref_code", "TEXT"],
    ["invited_by", "INTEGER"],
    ["referral_count", "INTEGER NOT NULL DEFAULT 0"],
    ["bonus_spreads", "INTEGER NOT NULL DEFAULT 0"],
    ["last_active_at", "TEXT"],
    ["streak_grace_used", "INTEGER NOT NULL DEFAULT 0"],
    ["unsubscribed_at", "TEXT"],
    ["timezone_asked_at", "TEXT"],
  ];
  for (const [name, typ] of userNeed) {
    if (!userCols.has(name)) {
      try {
        db.exec(`ALTER TABLE bot_users ADD COLUMN ${name} ${typ}`);
        console.log(`[schema] added bot_users.${name}`);
      } catch (err) {
        console.error(`[schema] bot_users.${name}`, err);
      }
    }
  }

  const sessionNeed: Array<[string, string]> = [
    ["deck_id", "TEXT"],
    ["teaser_seed", "TEXT"],
    ["collage_cache_key", "TEXT"],
    ["plain_token_prefix", "TEXT"],
    ["expired_at", "TEXT"],
  ];
  for (const [name, typ] of sessionNeed) {
    if (!sessionCols.has(name)) {
      try {
        db.exec(`ALTER TABLE bot_guest_sessions ADD COLUMN ${name} ${typ}`);
        console.log(`[schema] added bot_guest_sessions.${name}`);
      } catch (err) {
        console.error(`[schema] bot_guest_sessions.${name}`, err);
      }
    }
  }
}
