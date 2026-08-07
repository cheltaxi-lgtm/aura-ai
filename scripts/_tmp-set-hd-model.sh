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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const cur = await c.query("SELECT value FROM platform_settings WHERE key = 'ai'");
  const value = { ...(cur.rows[0]?.value ?? {}), hdModel: "moonshotai/kimi-k2.5" };
  await c.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    ["ai", JSON.stringify(value)]
  );
  const check = await c.query("SELECT value FROM platform_settings WHERE key = 'ai'");
  const v = check.rows[0]?.value ?? {};
  console.log(JSON.stringify({ model: v.model, paidModel: v.paidModel, freeModel: v.freeModel, hdModel: v.hdModel }));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
NODE
