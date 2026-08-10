#!/usr/bin/env bash
set -euo pipefail
echo "=== stdout ==="
tail -25 /tmp/rerun_red_stdout.log 2>/dev/null || echo no_stdout
echo "=== proc ==="
pgrep -af '_tmp-rerun-red' || echo red_done
echo "=== results ==="
if test -f /tmp/rerun_red_results.json; then
  python3 - <<'PY'
import json
d=json.load(open("/tmp/rerun_red_results.json"))
for k,v in d.get("kinds",{}).items():
    print(f"{k}: ok={v.get('ok')} p1={v.get('p1')} p2={v.get('p2')} p3={v.get('p3')} p4={v.get('p4')} status={v.get('status')} charges={v.get('charges')}")
for k,v in (d.get("special") or {}).items():
    print(f"special.{k}: ok={v.get('ok')} sawPending={v.get('sawPending')} sawPendingRetry={v.get('sawPendingRetry')} sawCircuit={v.get('sawCircuit')} final={v.get('finalStatus')} chargeDelta={v.get('chargeDelta')}")
print("finishedAt", d.get("finishedAt"))
PY
fi
echo "=== workers ==="
systemctl is-active aura-ai-async-jobs || true
pgrep -c -f 'tsx scripts/run-async-jobs.ts' || echo 0
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs || true
