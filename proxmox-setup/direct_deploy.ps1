# Aura — прямой деплой на VM 900 без jump-хоста
# Требует: SSH-ключ в authorized_keys на 192.168.1.152 (setup_direct_ssh.ps1)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Tarball = Join-Path $env:TEMP "aura-ai-deploy.tgz"
$VmHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "root@217.12.37.32" }
$DefaultKey = Join-Path $env:USERPROFILE ".ssh\aura_deploy_ed25519"
$SshKey = if ($env:DEPLOY_SSH_KEY) { $env:DEPLOY_SSH_KEY } elseif (Test-Path $DefaultKey) { $DefaultKey } else { $null }

function Get-SshBaseArgs {
  $args = @("-o", "StrictHostKeyChecking=no")
  if ($SshKey) { $args += @("-i", $SshKey) }
  return $args
}

Write-Host ">>> Building tarball..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
tar -czf $Tarball -C $ProjectRoot --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .
Write-Host "    $((Get-Item $Tarball).Length) bytes"

Write-Host ">>> Upload to VM..."
$scpArgs = @(Get-SshBaseArgs) + @($Tarball, "${VmHost}:/tmp/aura-ai-deploy.tgz")
& scp.exe @scpArgs

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
$sshArgs = @(Get-SshBaseArgs) + @($VmHost, "bash", "-s")
$DeployCmd | & ssh.exe @sshArgs

Write-Host ">>> Done: https://zovus.ru"
