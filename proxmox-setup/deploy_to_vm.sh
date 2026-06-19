#!/bin/bash
# AuraAI — развёртывание проекта на VM 900 (запускать с jump-хоста ubuntu@192.168.1.50)
set -euo pipefail

VMID=900
PVE="root@192.168.1.52"
SSH="sudo ssh -o BatchMode=yes -o StrictHostKeyChecking=no"
CI_USER="ubuntu"
CI_PASS="AuraAI-Dev2026!"
PROJECT_SRC="${1:-/tmp/aura-ai-deploy}"

get_vm_ip() {
  for i in $(seq 1 60); do
    IP=$($SSH "$PVE" "qm guest cmd $VMID network-get-interfaces 2>/dev/null" \
      | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for iface in data:
        for addr in iface.get('ip-addresses', []):
            if addr.get('ip-address-type') == 'ipv4' and not addr['ip-address'].startswith('127.'):
                print(addr['ip-address']); raise SystemExit
except: pass
" 2>/dev/null || true)
    if [ -n "${IP:-}" ]; then
      echo "$IP"
      return 0
    fi
    sleep 5
  done
  return 1
}

echo ">>> Ожидание IP VM $VMID..."
VM_IP=$(get_vm_ip) || { echo "Не удалось получить IP VM"; exit 1; }
echo ">>> VM IP: $VM_IP"

echo ">>> Ожидание SSH..."
for i in $(seq 1 30); do
  if sshpass -p "$CI_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${CI_USER}@${VM_IP}" "echo ok" 2>/dev/null; then
    break
  fi
  sleep 5
done

REMOTE="${CI_USER}@${VM_IP}"
SSHPASS="sshpass -p $CI_PASS"

echo ">>> Копирование проекта..."
$SSHPASS scp -o StrictHostKeyChecking=no -r "$PROJECT_SRC/"* "${REMOTE}:/tmp/aura-ai/"

echo ">>> init_ubuntu.sh..."
$SSHPASS ssh -o StrictHostKeyChecking=no "$REMOTE" "sudo mkdir -p /opt/aura-ai && sudo cp -r /tmp/aura-ai/* /opt/aura-ai/ && cd /opt/aura-ai && sudo bash proxmox-setup/init_ubuntu.sh"

echo ">>> Docker Compose..."
$SSHPASS ssh -o StrictHostKeyChecking=no "$REMOTE" "cd /opt/aura-ai && sudo docker compose up -d"

echo ">>> Node.js приложение..."
$SSHPASS ssh -o StrictHostKeyChecking=no "$REMOTE" "cd /opt/aura-ai && sudo npm install && sudo npm run build"

echo ">>> Systemd сервис..."
$SSHPASS ssh -o StrictHostKeyChecking=no "$REMOTE" "sudo tee /etc/systemd/system/aura-ai.service > /dev/null <<'UNIT'
[Unit]
Description=AuraAI Next.js
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/opt/aura-ai
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now aura-ai"

echo ""
echo ">>> Готово! AuraAI: http://${VM_IP}:3000"
echo ">>> pgAdmin:   http://${VM_IP}:5050 (admin@auraai.dev / admin)"
echo ">>> PostgreSQL: ${VM_IP}:5432 (auraai / auraai_secret)"
