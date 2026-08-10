import { readFileSync } from "node:fs";
import pg from "pg";

for (const line of readFileSync("/opt/aura-ai/.env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `UPDATE async_jobs
   SET status='failed', error_code='smoke_reset',
       error_message='reset after build-interfered kill',
       updated_at=NOW(), next_attempt_at=NULL, worker_id=NULL
   WHERE status IN ('pending','running')
     AND kind IN (
       'hd_report','hd_composite_report','pro_premium_report','numerology_reading',
       'natal_interpretation','natal_forecast','natal_compatibility'
     )
   RETURNING id, kind`
);
console.log(JSON.stringify({ failed: r.rowCount, rows: r.rows }));
await c.end();
