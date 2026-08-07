import fs from "fs";
import { Client } from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const uid = "2383df09-bb04-444d-9672-b9f3afd8c34c";
const u = await c.query(
  `SELECT id, name, birth_date::text, birth_time::text, birth_city
   FROM users WHERE id = $1`,
  [uid]
);
console.log("user", u.rows[0]);

const charts = await c.query(
  `SELECT id, subject_kind, subject_name, birth_date::text AS birth,
          birth_time::text AS time, time_unknown, place_name,
          left(fingerprint, 20) AS fp,
          chart->'type' AS type,
          chart->'profile' AS profile,
          chart->'authority' AS authority,
          created_at, updated_at
   FROM hd_charts WHERE user_id = $1
   ORDER BY created_at`,
  [uid]
);
console.log("charts", JSON.stringify(charts.rows, null, 2));

await c.end();
