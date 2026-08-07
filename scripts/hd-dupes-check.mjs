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

const users = await c.query(
  `SELECT id, name, birth_date::text AS birth
   FROM users
   WHERE name ILIKE '%еннад%' OR name ILIKE '%Genn%'
   LIMIT 20`
);
console.log("users", users.rows);

for (const row of users.rows) {
  const charts = await c.query(
    `SELECT id, subject_kind, subject_name, birth_date::text AS birth,
            birth_time::text AS time, time_unknown, place_name,
            left(fingerprint, 16) AS fp, created_at
     FROM hd_charts
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [row.id]
  );
  console.log("\n=== charts for", row.name, row.id, "count=", charts.rows.length);
  for (const ch of charts.rows) console.log(ch);
}

const byBirth = await c.query(
  `SELECT h.user_id::text AS uid, u.name, count(*)::int AS n,
          array_agg(
            coalesce(h.subject_kind,'self') || '|' || h.birth_date::text || '|' ||
            coalesce(h.subject_name,'') || '|' || left(h.fingerprint,8) || '|' ||
            left(h.place_name,40)
            ORDER BY h.created_at DESC
          ) AS items
   FROM hd_charts h
   JOIN users u ON u.id = h.user_id
   WHERE h.birth_date IN ('1979-09-18', '1984-10-18')
   GROUP BY h.user_id, u.name
   ORDER BY n DESC
   LIMIT 20`
);
console.log("\nby screenshot births:");
for (const r of byBirth.rows) console.log(JSON.stringify(r));

const multi = await c.query(
  `SELECT left(user_id::text, 8) AS uid,
          count(*)::int AS n,
          count(DISTINCT fingerprint)::int AS distinct_fp,
          count(DISTINCT birth_date)::int AS distinct_birth,
          array_agg(
            coalesce(subject_kind,'self') || '|' || birth_date::text || '|' ||
            coalesce(subject_name,'') || '|' || left(fingerprint,8)
            ORDER BY created_at DESC
          ) AS items
   FROM hd_charts
   WHERE user_id IS NOT NULL
   GROUP BY user_id
   HAVING count(*) >= 3
   ORDER BY n DESC
   LIMIT 15`
);
console.log("\nusers with 3+ charts:");
for (const r of multi.rows) console.log(JSON.stringify(r));

const sameBirthDupes = await c.query(
  `SELECT u.name, h.user_id::text AS uid, h.birth_date::text AS birth, count(*)::int AS n,
          array_agg(left(h.fingerprint,12) ORDER BY h.created_at) AS fps,
          array_agg(left(h.place_name,50) ORDER BY h.created_at) AS places,
          array_agg(coalesce(h.birth_time::text,'?') ORDER BY h.created_at) AS times
   FROM hd_charts h
   JOIN users u ON u.id = h.user_id
   GROUP BY h.user_id, u.name, h.birth_date
   HAVING count(*) >= 2
   ORDER BY n DESC
   LIMIT 25`
);
console.log("\nsame user+birth with 2+ rows:");
for (const r of sameBirthDupes.rows) console.log(JSON.stringify(r));

await c.end();
