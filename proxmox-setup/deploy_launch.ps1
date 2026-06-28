# Launch deploy — full pipeline with migrations and env validation
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Tarball = Join-Path $env:TEMP "aura-ai-deploy.tgz"
$VmHost = "ubuntu@192.168.1.152"

Write-Host ">>> Building tarball..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
tar -czf $Tarball -C $ProjectRoot --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .
Write-Host "    $((Get-Item $Tarball).Length) bytes"

Write-Host ">>> Upload to VM..."
scp -o StrictHostKeyChecking=no $Tarball "${VmHost}:/tmp/aura-ai-deploy.tgz"

Write-Host ">>> Deploy on VM (migrations + env check)..."
$DeployCmd = @'
set -e
ENV_FILE="/opt/aura-ai/.env.local"
ENV_BACKUP="/tmp/aura-ai-env.local.bak"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  echo "Backed up .env.local"
fi
sudo tar -xzf /tmp/aura-ai-deploy.tgz -C /opt/aura-ai
sudo chown -R ubuntu:ubuntu /opt/aura-ai
if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$ENV_FILE"
  echo "Restored production .env.local"
fi
sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
chmod +x /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
cd /opt/aura-ai && SKIP_EXTRACT=1 bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
curl -sS http://127.0.0.1:3000/api/health | head -c 200
echo ""
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
$DeployCmd | ssh -o StrictHostKeyChecking=no $VmHost "tr -d '\r' | bash -s"

Write-Host ">>> Done: https://zovus.ru"
