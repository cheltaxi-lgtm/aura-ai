import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { botConfig } from "../src/config.js";

function dump(db: DatabaseSync): string {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'bot_%' ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  const parts: string[] = [];
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{
      name: string;
      type: string;
    }>;
    parts.push(`${t.name}: ${cols.map((c) => c.name).join(",")}`);
  }
  return parts.join("\n");
}

function migrateFresh(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(readFileSync(join(botConfig.rootDir, "src/db/schema.sql"), "utf8"));
  const dir = join(botConfig.rootDir, "src/db/migrations");
  for (const file of readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const stmt of sql
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && s !== "SELECT 1")) {
      try {
        db.exec(stmt);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!/duplicate column|already exists/i.test(m)) throw e;
      }
    }
  }
  return db;
}

const freshPath = join(botConfig.dataDir, "_schema-fresh-tmp.sqlite");
const fresh = migrateFresh(freshPath);
const live = new DatabaseSync(botConfig.dbPath, { readOnly: true });
const a = dump(fresh);
const b = dump(live);
fresh.close();
live.close();
writeFileSync(join(botConfig.dataDir, "_schema-fresh.txt"), a);
writeFileSync(join(botConfig.dataDir, "_schema-live.txt"), b);
function toMap(dump: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const line of dump.split("\n")) {
    const [name, cols] = line.split(": ");
    if (!name || !cols) continue;
    m.set(name, new Set(cols.split(",")));
  }
  return m;
}

const A = toMap(a);
const B = toMap(b);
const tables = new Set([...A.keys(), ...B.keys()]);
let ok = true;
for (const t of [...tables].sort()) {
  const ca = A.get(t) ?? new Set();
  const cb = B.get(t) ?? new Set();
  const onlyA = [...ca].filter((c) => !cb.has(c));
  const onlyB = [...cb].filter((c) => !ca.has(c));
  if (onlyA.length || onlyB.length) {
    ok = false;
    console.log(`DIFF ${t}: freshOnly=${onlyA} liveOnly=${onlyB}`);
  }
}
if (ok) {
  console.log("SCHEMA COLUMN SETS MATCH (order may differ)");
} else {
  process.exit(1);
}
