# Push RESEND_API_KEY or SMTP_PASS to production .env.local (idempotent merge).
# Usage:
#   $env:RESEND_API_KEY = "re_..."
#   powershell -ExecutionPolicy Bypass -File scripts/push-mail-secret-to-prod.ps1
# or:
#   powershell -ExecutionPolicy Bypass -File scripts/push-mail-secret-to-prod.ps1 -SmtpPass "app-password"

param(
  [string]$ResendApiKey = $env:RESEND_API_KEY,
  [string]$SmtpPass = $env:SMTP_PASS
)

$ErrorActionPreference = "Stop"
$VmHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "root@217.12.37.32" }
$DefaultKey = Join-Path $env:USERPROFILE ".ssh\aura_deploy_ed25519"
$SshKey = if ($env:DEPLOY_SSH_KEY) { $env:DEPLOY_SSH_KEY } elseif (Test-Path $DefaultKey) { $DefaultKey } else { $null }
$KnownHosts = Join-Path $env:USERPROFILE ".ssh\known_hosts_aura_beget"

if (-not $ResendApiKey -and -not $SmtpPass) {
  Write-Error "Set RESEND_API_KEY or SMTP_PASS (env var or -ResendApiKey / -SmtpPass)"
}

$sshArgs = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=$KnownHosts")
if ($SshKey) { $sshArgs += @("-i", $SshKey) }

Write-Host ">>> Applying base mail env on prod..."
& ssh.exe @sshArgs $VmHost "bash /opt/aura-ai/hosting/apply-mail-env.sh /opt/aura-ai/.env.local"

$remoteScript = @'
set -euo pipefail
ENV_FILE=/opt/aura-ai/.env.local
tmp=$(mktemp)
grep -v -E '^(RESEND_API_KEY|SMTP_PASS)=' "$ENV_FILE" >"$tmp" || true
{
  cat "$tmp"
  echo ""
  echo "# Mail secrets (added by push-mail-secret-to-prod.ps1)"
'@

if ($ResendApiKey) {
  $remoteScript += "  echo 'RESEND_API_KEY=$ResendApiKey'"
}
if ($SmtpPass) {
  $remoteScript += "  echo 'SMTP_PASS=$SmtpPass'"
}

$remoteScript += @'
} >"$ENV_FILE"
rm -f "$tmp"
systemctl restart aura-ai.service
sleep 2
systemctl is-active aura-ai.service
'@

Write-Host ">>> Writing mail secret and restarting aura-ai..."
$remoteScript | & ssh.exe @sshArgs $VmHost "bash -s"
Write-Host ">>> Done. Verify in admin: https://zovus.ru/admin/email"
