#!/bin/bash
set -euo pipefail

VM_IP="192.168.1.152"
VM_PASS="AuraAI-Dev2026!"
VM_USER="ubuntu"
TARBALL="/tmp/aura-ai-deploy.tgz"

sshpass -p "$VM_PASS" scp -o StrictHostKeyChecking=no "$TARBALL" "${VM_USER}@${VM_IP}:/tmp/aura-ai-deploy.tgz"

sshpass -p "$VM_PASS" scp -o StrictHostKeyChecking=no "$TARBALL" "${VM_USER}@${VM_IP}:/tmp/aura-ai-deploy.tgz"

sshpass -p "$VM_PASS" ssh -o StrictHostKeyChecking=no "${VM_USER}@${VM_IP}" \
  "sudo tar -xzf /tmp/aura-ai-deploy.tgz -C /opt/aura-ai && sudo chown -R ubuntu:ubuntu /opt/aura-ai && sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/vm_local_deploy.sh && SKIP_EXTRACT=1 bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh"

echo "Deploy complete: http://${VM_IP}:3000"
