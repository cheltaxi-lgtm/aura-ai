#!/usr/bin/env bash
set -euo pipefail
echo "=== poll ==="
bash /tmp/_tmp-poll-rerun.sh || true
echo "=== worker procs ==="
pgrep -af 'run-async-jobs' || true
echo "=== proxy env ==="
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true
echo "=== log recent ==="
tail -60 /var/log/aura-ai/async-jobs.log
echo "=== job grep ==="
grep -F 'ecb5de26' /var/log/aura-ai/async-jobs.log | tail -20 || true
echo "=== watchdog/orphan ==="
grep -E 'watchdog|startup orphan|freed report|claim lane|finish ' /var/log/aura-ai/async-jobs.log | tail -30 || true
echo "=== db ==="
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
const { rows } = await c.query(
  `select id, kind, status, attempt_count, billing_state, error_code,
          left(coalesce(error_message,''),160) as em,
          started_at, updated_at, next_attempt_at, worker_id, heartbeat_at, generation_ms
   from async_jobs where id=$1`,
  ["ecb5de26-2831-4ae4-8ac6-3f104a1be014"]
);
console.log(JSON.stringify(rows[0], null, 2));
await c.end();
NODE
