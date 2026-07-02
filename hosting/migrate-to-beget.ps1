# Beget VPS migration — DO NOT commit credentials.
# Usage: .\hosting\migrate-to-beget.ps1
param(
  [string]$NewHost = "217.12.37.32",
  [string]$NewUser = "root",
  [string]$NewPass = $env:BEGET_VPS_PASSWORD,
  [string]$OldHost = "ubuntu@192.168.1.152",
  [string]$HostKey = "SHA256:yYe1n/6bTELbA/6baBYaNFZDNtwMqbP9xW4J7Jp/04U"
)

$ErrorActionPreference = "Stop"
$Plink = "C:\Program Files\PuTTY\plink.exe"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"
$Root = Split-Path $PSScriptRoot -Parent
$Tarball = Join-Path $env:TEMP "aura-ai-migrate.tgz"
$Dump = Join-Path $env:TEMP "auraai.dump"
$EnvBackup = Join-Path $env:TEMP "aura-ai.env.local"

if (-not $NewPass) { throw "Set BEGET_VPS_PASSWORD env var or pass -NewPass" }
if (-not (Test-Path $Plink)) { throw "Install PuTTY for plink/pscp" }

function Invoke-New($cmd) {
  & $Plink -ssh "${NewUser}@${NewHost}" -pw $NewPass -hostkey $HostKey -batch $cmd
}

function Copy-New($local, $remote) {
  & $Pscp -pw $NewPass -hostkey $HostKey $local "${NewUser}@${NewHost}:${remote}"
}

Write-Host ">>> Bootstrap new server..."
Copy-New "$Root\hosting\bootstrap-beget.sh" "/tmp/bootstrap-beget.sh"
Invoke-New "bash /tmp/bootstrap-beget.sh"

Write-Host ">>> Export DB from old VM..."
ssh -o BatchMode=yes -o ConnectTimeout=10 $OldHost "docker exec auraai-postgres pg_dump -U auraai -Fc auraai" | Set-Content -Path $Dump -Encoding Byte

Write-Host ">>> Export .env.local from old VM..."
ssh -o BatchMode=yes $OldHost "cat /opt/aura-ai/.env.local" | Set-Content -Path $EnvBackup -Encoding utf8

Write-Host ">>> Build tarball..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
tar -czf $Tarball -C $Root --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local .

Write-Host ">>> Upload to Beget VPS..."
Copy-New $Tarball "/tmp/aura-ai-deploy.tgz"
Copy-New $Dump "/tmp/auraai.dump"
Copy-New $EnvBackup "/opt/aura-ai/.env.local"
Copy-New "$Root\hosting\deploy-on-server.sh" "/opt/aura-ai/hosting/deploy-on-server.sh"
Copy-New "$Root\hosting\Caddyfile" "/opt/aura-ai/hosting/Caddyfile"
Copy-New "$Root\hosting\aura-ai.service" "/opt/aura-ai/hosting/aura-ai.service"

Write-Host ">>> Deploy on server (build + systemd + caddy)..."
Invoke-New "mkdir -p /opt/aura-ai /var/log/aura-ai && tar -xzf /tmp/aura-ai-deploy.tgz -C /opt/aura-ai && bash /opt/aura-ai/hosting/deploy-on-server.sh /tmp/aura-ai-deploy.tgz /tmp/auraai.dump"

Write-Host ">>> Done. Next: point zovus.ru A record to $NewHost (hosting/setup-dns-beget.sh)"
Write-Host "Check: curl -s https://zovus.ru/api/health (after DNS + SSL)"
