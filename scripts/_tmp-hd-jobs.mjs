import Database from "better-sqlite3";
import fs from "node:fs";

const candidates = [
  "/opt/aura-ai/data/aura.db",
  "/opt/aura-ai/data/app.db",
  "/opt/aura-ai/aura.db",
];
const dbPath = candidates.find((p) => fs.existsSync(p));
if (!dbPath) {
  console.error("no db found in", candidates);
  process.exit(1);
}
console.log("db:", dbPath);
const db = new Database(dbPath, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%job%'")
  .all();
console.log("job tables:", tables.map((t) => t.name).join(", "));

const rows = db
  .prepare(
    `SELECT id, kind, status, attempts, max_attempts, run_at, locked_at, locked_by, created_at, updated_at,
            substr(coalesce(last_error,''),1,200) AS err
     FROM async_jobs
     WHERE kind LIKE '%hd%' OR kind LIKE '%human%' OR kind LIKE '%report%' OR kind LIKE '%natal%'
     ORDER BY updated_at DESC LIMIT 25`
  )
  .all();
for (const r of rows) console.log(JSON.stringify(r));
