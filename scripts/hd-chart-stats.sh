#!/bin/bash
set -euo pipefail
cd /opt/aura-ai
node <<'NODE'
const fs = require("fs");
const { Client } = require("pg");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    WITH per AS (
      SELECT user_id,
             count(*)::int AS n,
             count(*) FILTER (WHERE COALESCE(subject_kind,'self') <> 'other')::int AS self_n,
             count(*) FILTER (WHERE subject_kind = 'other')::int AS other_n
      FROM hd_charts WHERE user_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT
      (SELECT count(*) FROM per) AS users_with_charts,
      (SELECT count(*) FROM per WHERE n >= 2) AS users_multi,
      (SELECT count(*) FROM per WHERE self_n = 0 AND other_n > 0) AS users_other_only,
      (SELECT count(*) FROM per WHERE self_n > 0 AND other_n > 0) AS users_both
  `);
  console.log("stats", q.rows[0]);
  const recent = await c.query(`
    SELECT left(user_id::text, 8) AS uid,
           subject_kind,
           birth_date::text AS birth,
           left(coalesce(subject_name, ''), 24) AS name,
           created_at
    FROM hd_charts WHERE user_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 15
  `);
  for (const r of recent.rows) {
    console.log(
      String(r.created_at).slice(0, 19),
      r.subject_kind || "self",
      r.birth,
      JSON.stringify(r.name),
      r.uid
    );
  }
  // Sample: multi-chart users where newest is other — do they still have self?
  const sample = await c.query(`
    SELECT left(h.user_id::text, 8) AS uid,
           count(*)::int AS n,
           count(*) FILTER (WHERE COALESCE(h.subject_kind,'self') <> 'other')::int AS self_n,
           array_agg(h.birth_date::text ORDER BY h.created_at DESC) AS births
    FROM hd_charts h
    WHERE h.user_id IS NOT NULL
    GROUP BY h.user_id
    HAVING count(*) >= 2
    ORDER BY max(h.created_at) DESC
    LIMIT 8
  `);
  console.log("multi samples:");
  for (const r of sample.rows) console.log(r);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE
