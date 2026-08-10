#!/usr/bin/env bash
set -euo pipefail
# Restore exactly one async-jobs worker via systemd. Never pkill by script path
# while a smoke harness may have that path in its argv.
systemctl kill -s KILL --kill-whom=all aura-ai-async-jobs 2>/dev/null || true
sleep 2
# Sweep leftover worker node processes (argv is the worker entry, not smoke).
while read -r pid; do
  [ -z "${pid:-}" ] && continue
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *_tmp-*|*smoke*|*rerun*) continue ;;
  esac
  if [[ "$cmd" == *"run-async-jobs.ts"* ]]; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done < <(pgrep -f 'run-async-jobs' || true)
sleep 1
bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai || true
systemctl reset-failed aura-ai-async-jobs || true
systemctl start aura-ai-async-jobs
sleep 4
systemctl is-active aura-ai-async-jobs
echo "worker_count=$(pgrep -c -f 'tsx scripts/run-async-jobs.ts' || echo 0)"
pgrep -af 'tsx scripts/run-async-jobs.ts' || true
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true
