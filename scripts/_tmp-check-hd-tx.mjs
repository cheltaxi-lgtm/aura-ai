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
  `select id, status, transaction_id is not null as has_tx,
          length(coalesce(report_text,'')) len, created_at, updated_at
   from hd_reports where id=$1`,
  ["91cbfb3b-27c2-4f25-b753-548daf4207c4"]
);
console.log(JSON.stringify(r.rows[0], null, 2));
await c.end();
