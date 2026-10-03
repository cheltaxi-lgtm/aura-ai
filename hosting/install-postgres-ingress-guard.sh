#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -m 755 "$ROOT/hosting/postgres-ingress-guard.sh" /usr/local/sbin/zovus-postgres-ingress
install -m 644 "$ROOT/hosting/zovus-postgres-ingress.service" /etc/systemd/system/zovus-postgres-ingress.service
systemctl daemon-reload
systemctl enable zovus-postgres-ingress.service
# Reload an active guard without stopping Docker, which requires this unit.
systemctl reload-or-restart zovus-postgres-ingress.service
systemctl is-active --quiet zovus-postgres-ingress.service
