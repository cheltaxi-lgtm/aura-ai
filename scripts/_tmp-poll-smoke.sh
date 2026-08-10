#!/usr/bin/env bash
set -euo pipefail
echo "=== stdout ==="
tail -25 /tmp/phase_b_smoke_stdout.log
echo "=== proc ==="
pgrep -af 'smoke-paid-report-kinds' || echo smoke_done
echo "=== results ==="
if test -f /tmp/phase_b_smoke_results.json; then
  python3 - <<'PY'
import json
d=json.load(open("/tmp/phase_b_smoke_results.json"))
kinds=d.get("kinds",{})
for k,v in kinds.items():
    print(f"{k}: ok={v.get('ok')} status={v.get('status')} elapsed={v.get('elapsedMs')}")
spec=d.get("special",{})
for k,v in spec.items():
    print(f"special.{k}: {v}")
print("finishedAt", d.get("finishedAt"))
PY
else
  echo no_results_yet
fi
echo "=== worker ==="
systemctl is-active aura-ai-async-jobs
tail -3 /var/log/aura-ai/async-jobs.log
