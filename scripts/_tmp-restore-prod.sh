#!/usr/bin/env bash
set -eu

echo "== kill smoke harness =="
pkill -f '_tmp-rerun-three' 2>/dev/null || true
pkill -f '_tmp-rerun-red' 2>/dev/null || true
pkill -f '_tmp-rerun-failed' 2>/dev/null || true
pkill -f 'smoke-paid-report' 2>/dev/null || true
sleep 1
pgrep -af '_tmp-rerun|smoke-paid' || echo smoke_cleared

echo "== fail smoke-owned stuck report jobs (not user readings) =="
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

// Smoke accounts only
const smokeUsers = (
  await c.query(
    `SELECT profile_user_id AS id FROM user_accounts
     WHERE id IN ('e6a7f708-4bd6-46f1-a3c7-0b34ceb803d2','b5dbca4c-114b-4c62-9546-011ad309e5bb')`
  )
).rows.map((r) => r.id);

const r = await c.query(
  `UPDATE async_jobs
   SET status='failed', error_code='smoke_aborted',
       error_message='aborted to restore production capacity',
       updated_at=NOW(), next_attempt_at=NULL, worker_id=NULL
   WHERE status IN ('pending','running')
     AND user_id = ANY($1::uuid[])
     AND kind IN (
       'hd_report','hd_composite_report','pro_premium_report','numerology_reading',
       'natal_interpretation','natal_forecast','natal_compatibility'
     )
   RETURNING id, kind, status`,
  [smokeUsers]
);
console.log("aborted_smoke", JSON.stringify(r.rows));

const active = await c.query(
  `SELECT id, user_id, kind, status, attempt_count, error_code, updated_at
   FROM async_jobs WHERE status IN ('pending','running')
   ORDER BY updated_at DESC LIMIT 30`
);
console.log("still_active", JSON.stringify(active.rows, null, 2));

const recentReading = await c.query(
  `SELECT id, kind, status, error_code, left(coalesce(error_message,''),80) em, updated_at
   FROM async_jobs
   WHERE kind IN ('reading','intention_spread','daily_reading','daily_extended')
     AND updated_at > now() - interval '2 hours'
   ORDER BY updated_at DESC LIMIT 20`
);
console.log("recent_readings", JSON.stringify(recentReading.rows, null, 2));
await c.end();
NODE

echo "== restore proxy + single worker =="
bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai
# Ensure proxy is not broken
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs
bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh || {
  systemctl reset-failed aura-ai-async-jobs || true
  systemctl restart aura-ai-async-jobs
  sleep 4
}
systemctl is-active aura-ai aura-ai-async-jobs
curl -s -o /dev/null -w 'health=%{http_code}\n' https://zovus.ru/api/health
curl -s -o /dev/null -w 'local=%{http_code}\n' http://127.0.0.1:3000/api/health

echo "== worker tail =="
tail -15 /var/log/aura-ai/async-jobs.log
