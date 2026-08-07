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
  const top = await c.query(`
    SELECT left(user_id::text, 8) AS uid,
           count(*)::int AS n,
           count(*) FILTER (WHERE kind = 'self')::int AS self_n,
           count(*) FILTER (WHERE kind <> 'self')::int AS other_n
    FROM matrix_subjects
    GROUP BY user_id
    ORDER BY n DESC
    LIMIT 12
  `);
  console.log("top users by subject count:");
  for (const r of top.rows) console.log(r);
  const noSelf = await c.query(`
    SELECT count(*)::int AS users_without_self
    FROM (
      SELECT user_id FROM matrix_subjects GROUP BY user_id
      HAVING count(*) FILTER (WHERE kind = 'self') = 0
    ) t
  `);
  console.log("users_without_self", noSelf.rows[0]);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE
