#!/usr/bin/env bash
# Hard-restart aura-ai-async-jobs without matching smoke harness cmdline.
# Never use: pkill -f 'scripts/run-async-jobs.ts' (kills the smoke itself).
# Avoid: systemctl kill -s KILL (Invalid argument on this VM's cgroup).
set -euo pipefail

UNIT=aura-ai-async-jobs

main_pid="$(systemctl show -p MainPID --value "$UNIT" 2>/dev/null || echo 0)"
cg="$(systemctl show -p ControlGroup --value "$UNIT" 2>/dev/null || true)"

systemctl stop "$UNIT" 2>/dev/null || true
sleep 1

if [[ -n "${main_pid}" && "${main_pid}" != "0" ]]; then
  kill -9 "${main_pid}" 2>/dev/null || true
  # Direct children of the former main PID
  for child in $(pgrep -P "${main_pid}" 2>/dev/null || true); do
    kill -9 "${child}" 2>/dev/null || true
  done
fi

# Sweep leftovers that still belong to this unit's cgroup only.
if [[ -n "${cg}" && "${cg}" != "/" ]]; then
  for pid in $(pgrep -f 'run-async-jobs' 2>/dev/null || true); do
    if grep -F "${cg}" "/proc/${pid}/cgroup" 2>/dev/null | grep -q .; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  done
fi

# Absolute last resort: only kill PIDs whose argv is the worker npm/tsx chain
# and whose cgroup name contains the unit — never bare cmdline substring match.
for pid in $(pgrep -f 'tsx scripts/run-async-jobs.ts' 2>/dev/null || true); do
  if grep -q 'aura-ai-async-jobs' "/proc/${pid}/cgroup" 2>/dev/null; then
    kill -9 "${pid}" 2>/dev/null || true
  fi
done

sleep 1
systemctl reset-failed "$UNIT" 2>/dev/null || true
systemctl start "$UNIT"
sleep 5
systemctl is-active "$UNIT"
echo "worker_pids=$(pgrep -d, -f 'tsx scripts/run-async-jobs.ts' || true)"
