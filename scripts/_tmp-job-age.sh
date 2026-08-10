#!/usr/bin/env bash
set -euo pipefail
cd /opt/aura-ai
DB=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
JOB=${1:-6b706b13-9acd-4e6e-886d-0b575ac0d704}
psql "$DB" -c "SELECT id, kind, status, billing_state, attempt_count, generation_ms, locked_at, started_at, now()-locked_at AS locked_age, left(coalesce(error_code,''),40) code FROM async_jobs WHERE id='$JOB';"
echo ---
pgrep -af '_tmp-wait-smoke|smoke-paid-report' | head -10 || true
echo ---
tail -3 /tmp/wait_smoke_out.log 2>/dev/null || echo no_wait_log
tail -3 /tmp/phase_b_smoke_stdout.log
