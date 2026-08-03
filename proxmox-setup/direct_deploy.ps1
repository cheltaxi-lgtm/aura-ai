# Aura — прямой деплой на VM 900 без jump-хоста
# Требует: SSH-ключ в authorized_keys на 192.168.1.152 (setup_direct_ssh.ps1)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Tarball = Join-Path $env:TEMP "aura-ai-deploy.tgz"
$VmHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "root@217.12.37.32" }
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

Write-Host ">>> Building tarball..."
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
$DeployShaFile = Join-Path $ProjectRoot "deploy-sha.txt"
try {
  git -C $ProjectRoot rev-parse HEAD 2>$null | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
} catch {
  "unknown" | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
}
# The bot's token and SQLite state live in the working tree locally; shipping them
# would overwrite production with a developer's (often test-generated) copy.
tar -czf $Tarball -C $ProjectRoot --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local --exclude=.cursor --exclude=telegram-bot/.env --exclude=telegram-bot/data .
Remove-Item $DeployShaFile -Force -ErrorAction SilentlyContinue
Write-Host "    $((Get-Item $Tarball).Length) bytes"

Write-Host ">>> Upload to VM..."
$scpArgs = @(Get-SshBaseArgs) + @($Tarball, "${VmHost}:/tmp/aura-ai-deploy.tgz")
& scp.exe @scpArgs

Write-Host ">>> Deploy on VM..."
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
# Exclude list must stay in sync with vm_local_deploy.sh. This rsync runs FIRST, so
# anything missing here is already destroyed by --delete before the safer rsync gets
# a chance to protect it (bot database, bot token, generated scene art).
rsync -a --delete --ignore-times \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  --exclude='.env.local' \
  --exclude='.env.async-jobs' \
  --exclude='public/releases/' \
  --exclude='public/scene-art/' \
  --exclude='.next/' \
  --exclude='.next-candidate/' \
  --exclude='.next-previous/' \
  --exclude='node_modules/' \
  --exclude='node_modules-candidate/' \
  --exclude='node_modules-previous/' \
  --exclude='.build-staging/' \
  --exclude='logs/' \
  --exclude='backups/' \
  --exclude='telegram-bot/.env' \
  --exclude='telegram-bot/data/' \
  --exclude='telegram-bot/node_modules/' \
  --exclude='telegram-bot/backups/' \
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
echo "=== DEPLOYED ===" && test -f /opt/aura-ai/src/app/app/page.tsx && echo module_a_app_page=ok
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
# Fold remote stderr into stdout on the VM: `next build` prints warnings there, and
# with ErrorActionPreference=Stop a native stderr write aborts this script mid-deploy,
# killing the remote build with services already stopped. Exit code still gates success.
$sshArgs = @(Get-SshBaseArgs) + @($VmHost, "bash -s 2>&1")
$DeployCmd | & ssh.exe @sshArgs
if ($LASTEXITCODE -ne 0) {
  throw "Remote deploy failed with exit code $LASTEXITCODE"
}

Write-Host ">>> Done: https://zovus.ru"
