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
$KnownHosts = Join-Path $env:USERPROFILE ".ssh\known_hosts_aura_beget"

function Get-SshBaseArgs {
  if ($SshKey) {
    $dir = Split-Path $KnownHosts -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return @(
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "UserKnownHostsFile=$KnownHosts",
      "-i", $SshKey
    )
  }
  return @()
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
$DeployShaFile = Join-Path $Root "deploy-sha.txt"
try {
  git -C $Root rev-parse HEAD 2>$null | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
} catch {
  "unknown" | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
}
tar -czf $Tarball -C $Root --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .
Remove-Item $DeployShaFile -Force -ErrorAction SilentlyContinue

Write-Host ">>> Upload tarball..."
Copy-Remote $Tarball "/tmp/aura-ai-deploy.tgz"

Write-Host ">>> Deploy on server (vm_local_deploy.sh)..."
$DeployCmd = @'
set -e
mkdir -p /opt/aura-ai/proxmox-setup /opt/aura-ai/logs
STAGE="$(mktemp -d)"
tar -xzf /tmp/aura-ai-deploy.tgz -C "$STAGE"
cp "$STAGE/proxmox-setup/vm_local_deploy.sh" /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
RELEASES_BACKUP=""
if [ -d "/opt/aura-ai/public/releases" ]; then
  RELEASES_BACKUP="$(mktemp -d)"
  cp -a /opt/aura-ai/public/releases/. "$RELEASES_BACKUP/"
fi
echo ">>> Bootstrap rsync from tarball..."
rsync -a --delete --ignore-times \
  --exclude='.env.local' \
  --exclude='public/releases/' \
  --exclude='.next/' \
  --exclude='.next-candidate/' \
  --exclude='.next-previous/' \
  --exclude='node_modules/' \
  --exclude='logs/' \
  "$STAGE/" /opt/aura-ai/
if [ -n "$RELEASES_BACKUP" ] && [ -d "$RELEASES_BACKUP" ]; then
  mkdir -p /opt/aura-ai/public/releases
  cp -a "$RELEASES_BACKUP/." /opt/aura-ai/public/releases/
  rm -rf "$RELEASES_BACKUP"
fi
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
    Write-Host "(none - fill YANDEX_OAUTH / VK keys in /opt/aura-ai/.env.local)"
  }
} catch {
  Write-Host "WARN: oauth endpoint not ready"
}

Write-Host "Done."

$LocalJournal = Join-Path $Root "scripts\prod-journal.txt"
$sha = try { git -C $Root rev-parse HEAD 2>$null } catch { "unknown" }
$stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
"local ${stamp} sha=${sha} host=${DeployHost} status=deploy_script_finished" | Add-Content -Path $LocalJournal
