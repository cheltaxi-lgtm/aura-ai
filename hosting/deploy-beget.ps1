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

Write-Host ">>> Deploy artifact preflight..."
$RequiredArtifacts = @(
  "data/geonames/cities.min.json",
  "scripts/migrate.mjs",
  "scripts/verify-natal-deploy-schema.mjs",
  "scripts/migrations/064_migrate_natal_report_history.sql",
  "scripts/migrations/065_migrate_natal_timing.sql",
  "scripts/migrations/066_migrate_natal_ai_preferences.sql",
  "scripts/migrations/067_migrate_private_report_shares.sql",
  "scripts/migrations/068_harden_natal_backend.sql",
  "scripts/migrations/069_migrate_natal_compatibility.sql",
  "scripts/migrations/070_migrate_natal_async_jobs.sql",
  "scripts/migrations/071_fix_natal_compatibility_snapshot_privacy.sql",
  "scripts/migrations/072_migrate_numerology_report_history.sql",
  "scripts/migrations/073_migrate_async_job_billing_and_reaper.sql",
  "scripts/migrations/074_migrate_registration_attribution.sql",
  "scripts/migrations/075_migrate_oauth_registration_attribution.sql",
  "scripts/migrations/076_migrate_guest_triplet_receipt.sql",
  "scripts/migrations/077_migrate_premium_ai_delivery.sql",
  "scripts/migrations/078_migrate_joint_combined_job.sql",
  "scripts/migrations/079_migrate_memory_governance.sql",
  "scripts/migrations/080_fix_memory_extraction_outbox.sql",
  "scripts/migrations/081_migrate_personal_memory_moat.sql",
  "scripts/migrations/082_migrate_memory_product_moat_v2.sql",
  "scripts/migrations/083_migrate_partner_leads.sql",
  "src/lib/partner-leads.ts",
  "src/app/api/partners/leads/route.ts",
  "src/app/api/admin/partners/leads/route.ts",
  "src/app/admin/partners/page.tsx",
  "src/components/seo/LandingPartnersSection.tsx",
  "src/components/partners/PartnerInquiryForm.tsx",
  "src/components/partners/PartnerInquiryModal.tsx",
  "src/app/api/memory/preferences/route.ts",
  "src/app/api/memory/activity/route.ts",
  "src/app/api/memory/facts/action/route.ts",
  "src/app/api/memory/session-facts/route.ts",
  "src/app/api/metrics/memory/route.ts",
  "src/components/PersonalMemoryChoice.tsx",
  "src/components/MemoryMoments.tsx",
  "src/components/MemoryAnchorSuggestion.tsx",
  "src/app/about/personal-memory/page.tsx",
  "src/app/api/cron/memory-extract/route.ts",
  "src/lib/memory/preferences.ts",
  "src/lib/memory/product-analytics.ts",
  "src/lib/memory/memory-analytics.ts",
  "src/lib/memory/extraction-jobs.ts",
  "src/lib/memory/tombstones.ts",
  "src/lib/memory/injection-guard.ts",
  "src/lib/memory/predicates.ts",
  "src/lib/memory/grounding.ts",
  "proxmox-setup/cron-memory-extract.sh",
  "scripts/verify-memory-policy.mjs",
  "scripts/verify-memory-analytics.mjs",
  "scripts/verify-personal-memory-product.mjs",
  "src/app/api/joint-reading/[token]/combine/route.ts",
  "scripts/verify-ai-delivery-invariants.mjs",
  "scripts/browser-smoke-joint-combined.mjs",
  "src/lib/repair/legacy-fallback-text.ts",
  "src/app/joint-reading/[token]/page.tsx",
  "src/lib/ai-generation-contract.ts",
  "src/lib/validated-ai-generation.ts",
  "src/lib/async-job-registry.ts",
  "src/lib/async-job-enqueue.ts",
  "src/lib/async-job-lifecycle.ts",
  "src/lib/client/wait-for-async-job.ts",
  "src/lib/intention-spread-client.ts",
  "src/lib/daily-energy.ts",
  "src/app/api/intention-spread/route.ts",
  "src/app/api/daily-reading/route.ts",
  "src/app/api/image/generate/route.ts",
  "src/app/api/reading/route.ts",
  "src/app/api/photo-reading/stream/route.ts",
  "src/app/api/ritual/[id]/regenerate/route.ts",
  "src/app/api/joint-reading/create/route.ts",
  "src/lib/photo-reading-stream.ts",
  "src/components/PhotoReadingFlow.tsx",
  "src/components/ritual/RitualGenerating.tsx",
  "src/components/seo/JointReadingInvite.tsx",
  "src/components/PremiumEnergyBlock.tsx",
  "src/app/admin/settings/page.tsx",
  "src/app/admin/ai/page.tsx",
  "src/app/api/admin/settings/route.ts",
  "scripts/verify-ai-delivery.mjs",
  "scripts/quarantine-legacy-fallback-readings.ts",
  "src/app/api/jobs/active/route.ts",
  "src/app/api/numerology/matrix-report/route.ts",
  "src/lib/services/numerology-report-service.ts",
  "scripts/run-async-jobs.ts",
  "hosting/aura-ai-async-jobs.service",
  "hosting/ensure-async-jobs-user.sh",
  "hosting/sync-async-jobs-env.sh",
  "proxmox-setup/vm_local_deploy.sh",
  "hosting/Caddyfile",
  "proxmox-setup/install-crons.sh",
  "proxmox-setup/cron-natal-transits.sh",
  "src/app/api/cron/natal-transits/route.ts",
  "src/app/api/natal-chart/ai-preferences/route.ts",
  "src/app/api/natal-chart/compatibility/route.ts",
  "src/app/api/natal-chart/compatibility/manual/route.ts",
  "src/app/api/natal-chart/compatibility/invite/route.ts",
  "src/app/api/natal-chart/compatibility/token/[token]/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/generate/route.ts",
  "src/app/api/natal-chart/event-preferences/route.ts",
  "src/app/api/natal-chart/forecast/route.ts",
  "src/app/api/natal-chart/history/route.ts",
  "src/app/api/natal-chart/history/[id]/route.ts",
  "src/app/api/natal-chart/interpretation/route.ts",
  "src/app/api/natal-chart/route.ts",
  "src/app/api/natal-chart/timing/route.ts",
  "src/app/api/public/reports/[token]/route.ts",
  "src/app/api/report-shares/[id]/route.ts",
  "src/app/api/report-shares/route.ts"
)
$MissingArtifacts = @($RequiredArtifacts | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $Root $_) -PathType Leaf)
})
if ($MissingArtifacts.Count -gt 0) {
  throw "Missing required deploy artifacts: $($MissingArtifacts -join ', ')"
}
$RequiredArtifacts | ForEach-Object { Write-Host "  [artifact] $_" }
Write-Host "Required deploy artifacts: $($RequiredArtifacts.Count)"

Write-Host ">>> Pack sources..."
$GeoNamesIndex = Join-Path $Root "data\geonames\cities.min.json"
& node -e "const fs=require('fs');const value=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!Array.isArray(value)||!value.length)throw new Error('GeoNames index must be a non-empty JSON array')" $GeoNamesIndex
if ($LASTEXITCODE -ne 0) { throw "GeoNames index validation failed; deploy will not rebuild or download it." }
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
$DeployShaFile = Join-Path $Root "deploy-sha.txt"
try {
  git -C $Root rev-parse HEAD 2>$null | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
} catch {
  "unknown" | Out-File -FilePath $DeployShaFile -Encoding ascii -NoNewline
}
tar -czf $Tarball -C $Root --exclude=node_modules --exclude=.next --exclude=.next-e2e --exclude=.git --exclude=.cursor --exclude=test-results --exclude=.env.local --exclude=data/geonames/cities15000.txt --exclude=data/geonames/cities15000.zip .
Remove-Item $DeployShaFile -Force -ErrorAction SilentlyContinue

Write-Host ">>> Upload tarball..."
Copy-Remote $Tarball "/tmp/aura-ai-deploy.tgz"

Write-Host ">>> Deploy on server (vm_local_deploy.sh)..."
$DeployCmd = @'
set -e
verify_geonames_index() {
  local file="$1"
  test -s "$file"
  node -e 'const fs=require("fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!Array.isArray(value)||!value.length)throw new Error("invalid GeoNames index")' "$file"
}
mkdir -p /opt/aura-ai/proxmox-setup /opt/aura-ai/logs
STAGE="$(mktemp -d)"
tar -xzf /tmp/aura-ai-deploy.tgz -C "$STAGE"
echo ">>> Verify GeoNames index before rsync..."
verify_geonames_index "$STAGE/data/geonames/cities.min.json"
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
echo ">>> Verify GeoNames index after rsync..."
verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
if [ -n "$RELEASES_BACKUP" ] && [ -d "$RELEASES_BACKUP" ]; then
  mkdir -p /opt/aura-ai/public/releases
  cp -a "$RELEASES_BACKUP/." /opt/aura-ai/public/releases/
  rm -rf "$RELEASES_BACKUP"
fi
# Keep Safe Browsing clean: never leave junk/test APKs on public paths.
rm -f /opt/aura-ai/public/zovus.apk \
  /opt/aura-ai/public/test-root.apk \
  /opt/aura-ai/public/releases/test.apk \
  /opt/aura-ai/public/releases/zovus-latest.zip
rm -rf "$STAGE"
sed -i 's/\r$//' /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
chmod +x /opt/aura-ai/proxmox-setup/vm_local_deploy.sh
bash /opt/aura-ai/proxmox-setup/vm_local_deploy.sh /tmp/aura-ai-deploy.tgz
'@
$DeployCmd = ($DeployCmd -replace "`r`n", "`n" -replace "`r", "`n")
if ($SshKey) {
  $sshArgs = @(Get-SshBaseArgs) + @("${User}@${DeployHost}", "bash", "-s")
  $DeployCmd | & ssh.exe @sshArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy failed with exit code $LASTEXITCODE (active .next was not activated if candidate gates failed)"
  }
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
