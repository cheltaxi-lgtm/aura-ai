#!/usr/bin/env bash
set -euo pipefail
echo "=== stdout ==="
tail -20 /tmp/rerun_failed_stdout.log
echo "=== proc ==="
pgrep -af '_tmp-rerun-failed' || echo rerun_done
echo "=== results ==="
if test -f /tmp/rerun_failed_results.json; then
  python3 - <<'PY'
import json
d=json.load(open("/tmp/rerun_failed_results.json"))
for k,v in d.get("kinds",{}).items():
    print(f"{k}: ok={v.get('ok')} p1={v.get('p1')} p2={v.get('p2')} p3={v.get('p3')} p4={v.get('p4')} status={v.get('status')}")
for k,v in (d.get("special") or {}).items():
    print(f"special.{k}: ok={v.get('ok')} { {kk:v.get(kk) for kk in v if kk!='ok'} }")
print("finishedAt", d.get("finishedAt"))
PY
fi
