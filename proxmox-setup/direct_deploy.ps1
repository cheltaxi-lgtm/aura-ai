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
mkdir -p /opt/aura-ai/proxmox-setup
STAGE="$(mktemp -d)"
tar -xzf /tmp/aura-ai-deploy.tgz -C "$STAGE"
cp "$STAGE/proxmox-setup/vm_local_deploy.sh" /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
rm -rf "$STAGE"
sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
chmod +x /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh /tmp/aura-ai-deploy.tgz
echo "=== DEPLOYED ===" && test -f /opt/aura-ai/src/app/app/page.tsx && echo module_a_app_page=ok
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
# Strip any CR re-added by the PowerShell→ssh stdin pipe before bash parses it,
# otherwise the final line arrives as e.g. `head -1\r` and breaks.
$DeployCmd | ssh -o StrictHostKeyChecking=no $VmHost "tr -d '\r' | bash -s"

Write-Host ">>> Done: https://zovus.ru"
