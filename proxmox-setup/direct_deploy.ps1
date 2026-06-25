# Aura — прямой деплой на VM 900 без jump-хоста
# Требует: SSH-ключ в authorized_keys на 192.168.1.152 (setup_direct_ssh.ps1)

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

Write-Host ">>> Deploy on VM..."
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
echo "=== DEPLOYED VERSION ===" && grep 'PHOTO_UPLOAD_REV' /opt/aura-ai/src/components/PhotoReadingFlow.tsx | head -1
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
# Strip any CR re-added by the PowerShell→ssh stdin pipe before bash parses it,
# otherwise the final line arrives as e.g. `head -1\r` and breaks.
$DeployCmd | ssh -o StrictHostKeyChecking=no $VmHost "tr -d '\r' | bash -s"

Write-Host ">>> Done: https://zovus.ru"
