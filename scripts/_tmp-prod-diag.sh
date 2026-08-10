#!/usr/bin/env bash
set -eu
echo ===UNITS===
systemctl is-active aura-ai aura-ai-async-jobs caddy || true
echo ===HEALTH===
curl -s -o /dev/null -w 'local=%{http_code}\n' http://127.0.0.1:3000/api/health || true
curl -s -o /dev/null -w 'public=%{http_code}\n' https://zovus.ru/api/health || true
curl -s http://127.0.0.1:3000/api/health | head -c 500 || true
echo
echo ===PROXY===
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true
echo ===WORKER_PROCS===
pgrep -af 'run-async-jobs|tsx scripts' | head -10 || true
echo ===SMOKE===
pgrep -af '_tmp-rerun|_tmp-smoke|smoke-paid' | head -10 || true
echo ===JOBS===
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
const q = await c.query(`
  select status, kind, count(*)::int n
  from async_jobs
  where updated_at > now() - interval '6 hours'
  group by 1,2 order by 3 desc`);
console.log("recent", JSON.stringify(q.rows));
const r = await c.query(`
  select id, kind, status, attempt_count, error_code,
         left(coalesce(error_message,''),100) em, updated_at
  from async_jobs
  where status in ('pending','running')
  order by updated_at desc limit 20`);
console.log("active", JSON.stringify(r.rows, null, 2));
await c.end();
NODE
echo ===ASYNC_LOG===
tail -50 /var/log/aura-ai/async-jobs.log
echo ===APP_LOG===
tail -30 /var/log/aura-ai/app.log
