# Incremental deploy to Beget VPS (preserves /opt/aura-ai/.env.local).
# Usage:
#   .\hosting\deploy-beget.ps1
# Uses ~/.ssh/aura_deploy_ed25519 when present, else BEGET_VPS_PASSWORD + PuTTY.
param(
  [string]$DeployHost = "217.12.37.32",
  [string]$User = "root",
  [string]$Password = $env:BEGET_VPS_PASSWORD,
  [string]$HostKey = "SHA256:yYe1n/6bTELbA/6baBYaNFZDNtwMqbP9xW4J7Jp/04U"
)

$ErrorActionPreference = "Stop"
$Plink = "C:\Program Files\PuTTY\plink.exe"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"
$Root = Split-Path $PSScriptRoot -Parent
$Tarball = Join-Path $env:TEMP "aura-ai-deploy.tgz"
$DefaultKey = Join-Path $env:USERPROFILE ".ssh\aura_deploy_ed25519"
$SshKey = if ($env:DEPLOY_SSH_KEY) { $env:DEPLOY_SSH_KEY } elseif (Test-Path $DefaultKey) { $DefaultKey } else { $null }

function Get-SshBaseArgs {
  $args = @("-o", "StrictHostKeyChecking=no")
  if ($SshKey) { $args += @("-i", $SshKey) }
  return $args
}

if (-not $SshKey -and -not $Password) {
  throw "Set BEGET_VPS_PASSWORD or install SSH key at $DefaultKey"
}
if (-not $SshKey -and -not (Test-Path $Plink)) {
  throw "Install PuTTY (plink/pscp) or use SSH key at $DefaultKey"
}

function Invoke-Remote($cmd) {
  if ($SshKey) {
    $sshArgs = @(Get-SshBaseArgs) + @("${User}@${DeployHost}", $cmd)
    & ssh.exe @sshArgs
    return
  }
  & $Plink -ssh "${User}@${DeployHost}" -pw $Password -hostkey $HostKey -batch $cmd
}

function Copy-Remote($local, $remote) {
  if ($SshKey) {
    $scpArgs = @(Get-SshBaseArgs) + @($local, "${User}@${DeployHost}:${remote}")
    & scp.exe @scpArgs
    return
  }
  & $Pscp -pw $Password -hostkey $HostKey $local "${User}@${DeployHost}:${remote}"
}

Write-Host ">>> Pack sources..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
tar -czf $Tarball -C $Root --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .

Write-Host ">>> Upload tarball..."
Copy-Remote $Tarball "/tmp/aura-ai-deploy.tgz"

Write-Host ">>> Deploy on server (vm_local_deploy.sh)..."
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
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
if ($SshKey) {
  $sshArgs = @(Get-SshBaseArgs) + @("${User}@${DeployHost}", "bash", "-s")
  $DeployCmd | & ssh.exe @sshArgs
} else {
  Invoke-Remote $DeployCmd
}

Write-Host ">>> Health check..."
try {
  $code = Invoke-WebRequest -Uri "https://zovus.ru/api/health" -UseBasicParsing -TimeoutSec 20
  Write-Host "health: $($code.StatusCode)"
} catch {
  Write-Host "WARN: external health check failed"
}

Write-Host ">>> OAuth providers:"
try {
  $oauth = Invoke-RestMethod -Uri "https://zovus.ru/api/auth/oauth/providers" -TimeoutSec 20
  if ($oauth.providers.Count -gt 0) {
    Write-Host ($oauth.providers -join ", ")
  } else {
    Write-Host "(none — fill YANDEX_OAUTH / VK / MAILRU keys in /opt/aura-ai/.env.local)"
  }
} catch {
  Write-Host "WARN: oauth endpoint not ready"
}

Write-Host "Done."
