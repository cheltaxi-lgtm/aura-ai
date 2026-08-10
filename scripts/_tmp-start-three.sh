#!/usr/bin/env bash
set -eu

echo "== stop leftover rerun =="
pkill -f '_tmp-rerun-three' 2>/dev/null || true
pkill -f '_tmp-rerun-red' 2>/dev/null || true
sleep 1
pgrep -af '_tmp-rerun' || echo none_running

echo "== no build must be running =="
pgrep -af 'next build' || echo no_build

echo "== reset stuck report jobs =="
cd /opt/aura-ai && node scripts/_tmp-reset-stuck-jobs.mjs

echo "== env + single worker =="
bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai
bash /opt/aura-ai/scripts/smoke-restart-async-worker.sh
systemctl is-active aura-ai aura-ai-async-jobs
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs

echo "== launch three-rerun =="
cd /opt/aura-ai
nohup node scripts/_tmp-rerun-three.mjs > /tmp/rerun_three_stdout.log 2>&1 &
echo "THREE_PID=$!"
sleep 4
tail -5 /tmp/rerun_three_stdout.log
