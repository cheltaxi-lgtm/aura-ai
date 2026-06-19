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
ssh -o StrictHostKeyChecking=no $VmHost @"
sudo tar -xzf /tmp/aura-ai-deploy.tgz -C /opt/aura-ai && sudo chown -R ubuntu:ubuntu /opt/aura-ai && sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/vm_local_deploy.sh && SKIP_EXTRACT=1 bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
"@

Write-Host ">>> Done: http://192.168.1.152:3000"
