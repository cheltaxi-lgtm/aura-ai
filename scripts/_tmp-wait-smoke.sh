#!/usr/bin/env bash
# Poll until smoke finishes; print DONE marker for remote notify.
set -euo pipefail
for i in $(seq 1 200); do
  if ! pgrep -f 'smoke-paid-report-kinds' >/dev/null 2>&1; then
    echo "SMOKE_PROCESS_ENDED"
    if test -f /tmp/phase_b_smoke_results.json; then
      python3 - <<'PY'
import json
d=json.load(open("/tmp/phase_b_smoke_results.json"))
print("finishedAt", d.get("finishedAt"))
kinds=d.get("kinds",{})
for k,v in kinds.items():
    print(f"KIND {k} ok={v.get('ok')} status={v.get('status')} elapsed={v.get('elapsedMs')} p1={v.get('p1_completed_via_worker')} p3={v.get('p3_validator')} p4={v.get('p4_single_charge')}")
for k,v in (d.get("special") or {}).items():
    print(f"SPECIAL {k} {json.dumps(v, ensure_ascii=False)[:300]}")
PY
    else
      echo "NO_RESULTS_FILE"
      tail -40 /tmp/phase_b_smoke_stdout.log
    fi
    echo "SMOKE_POLL_COMPLETE"
    exit 0
  fi
  # progress line
  tail -1 /tmp/phase_b_smoke_stdout.log 2>/dev/null || true
  sleep 60
done
echo "SMOKE_POLL_TIMEOUT"
exit 1
