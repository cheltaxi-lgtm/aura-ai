#!/bin/bash
set -euo pipefail

VM_IP="192.168.1.152"
VM_PASS="AuraAI-Dev2026!"
VM_USER="ubuntu"

run_vm() {
  ssh -o StrictHostKeyChecking=no "${VM_USER}@${VM_IP}" "$@"
}

copy_vm() {
  scp -o StrictHostKeyChecking=no "$1" "${VM_USER}@${VM_IP}:$2"
}

echo ">>> Waiting for SSH..."
for i in $(seq 1 20); do
  if run_vm "echo ssh_ok" 2>/dev/null; then break; fi
  sleep 10
done

echo ">>> Extracting project..."
run_vm "sudo mkdir -p /opt/aura-ai"
copy_vm /tmp/aura-ai-deploy.tgz /tmp/aura-ai-deploy.tgz
run_vm "sudo tar -xzf /tmp/aura-ai-deploy.tgz -C /opt/aura-ai && sudo chown -R ubuntu:ubuntu /opt/aura-ai"

echo ">>> init_ubuntu.sh (5-10 min)..."
run_vm "sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/init_ubuntu.sh && sudo bash /opt/aura-ai/proxmox-setup/init_ubuntu.sh"

echo ">>> Docker Compose..."
run_vm "cd /opt/aura-ai && sudo docker compose up -d"

echo ">>> Build Next.js..."
run_vm "cd /opt/aura-ai && npm install && ([ -f data/geonames/cities.min.json ] || npm run build:geonames) && npm run migrate && npm run build && bash proxmox-setup/install-crons.sh"

echo ">>> Systemd service..."
run_vm "sudo tee /etc/systemd/system/aura-ai.service > /dev/null <<'UNIT'
[Unit]
Description=AuraAI Next.js
After=network.target docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/aura-ai
Environment=NODE_ENV=production
EnvironmentFile=/opt/aura-ai/.env.local
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now aura-ai"

echo ">>> Stop old containers on jump host..."
cd /home/ubuntu/aura-ai 2>/dev/null && docker compose down 2>/dev/null || true

echo ""
echo "DONE: http://${VM_IP}:3000"
echo "pgAdmin: http://${VM_IP}:5050"
