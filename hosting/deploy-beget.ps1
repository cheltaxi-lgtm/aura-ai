# Incremental deploy to Beget VPS (preserves /opt/aura-ai/.env.local).
# Usage:
#   $env:BEGET_VPS_PASSWORD = '...'
#   .\hosting\deploy-beget.ps1
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

if (-not $Password) { throw "Set BEGET_VPS_PASSWORD or pass -Password" }
if (-not (Test-Path $Plink)) { throw "Install PuTTY (plink/pscp)" }

function Invoke-Remote($cmd) {
  & $Plink -ssh "${User}@${DeployHost}" -pw $Password -hostkey $HostKey -batch $cmd
}

function Copy-Remote($local, $remote) {
  & $Pscp -pw $Password -hostkey $HostKey $local "${User}@${DeployHost}:${remote}"
}

Write-Host ">>> Pack sources..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
tar -czf $Tarball -C $Root --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .

Write-Host ">>> Upload tarball..."
Copy-Remote $Tarball "/tmp/aura-ai-deploy.tgz"

Write-Host ">>> Deploy on server (vm_local_deploy.sh)..."
Invoke-Remote "bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh /tmp/aura-ai-deploy.tgz"

Write-Host ">>> Health check..."
try {
  $code = Invoke-WebRequest -Uri "https://zovus.ru/api/health" -UseBasicParsing -TimeoutSec 20
  Write-Host "health: $($code.StatusCode)"
} catch {
  Write-Host "WARN: external health check failed (DNS/SSL may still be updating)"
}

Write-Host ">>> OAuth providers:"
try {
  $oauth = Invoke-RestMethod -Uri "https://zovus.ru/api/auth/oauth/providers" -TimeoutSec 20
  Write-Host ($oauth.providers -join ", ")
} catch {
  Write-Host "WARN: oauth endpoint not ready yet"
}

Write-Host "Done."
