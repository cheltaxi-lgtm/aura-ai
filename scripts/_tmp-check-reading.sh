#!/usr/bin/env bash
set -eu
echo ===SERVICES===
systemctl is-active aura-ai aura-ai-async-jobs caddy
systemctl list-units --type=service --state=running | grep -Ei 'postgres|aura|caddy' || true
echo ===READING_ERRORS===
grep -E 'reading|intention|spread|error|Error|502|500' /var/log/aura-ai/app.log | tail -40 || true
echo ===ASYNC_RECENT_ALL===
cd /opt/aura-ai && node --import tsx <<'NODE'
import { readFileSync } from "fs";
import pg from "pg";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  select kind, status, count(*)::int n,
         max(updated_at) as last_upd
  from async_jobs
  where updated_at > now() - interval '24 hours'
  group by 1,2
  order by last_upd desc`);
console.log(JSON.stringify(r.rows, null, 2));
const failed = await c.query(`
  select id, kind, status, error_code, left(coalesce(error_message,''),120) em, updated_at
  from async_jobs
  where status='failed' and updated_at > now() - interval '6 hours'
  order by updated_at desc limit 15`);
console.log("failed", JSON.stringify(failed.rows, null, 2));
await c.end();
NODE
echo ===OPENROUTER_PROBE===
grep -E 'OpenRouter|UNAVAILABLE|paused|claim lane=other|claim lane=report' /var/log/aura-ai/async-jobs.log | tail -20
echo ===SLOTS===
# reportSlots should be 0/1 free
tail -5 /var/log/aura-ai/async-jobs.log
