# Set GitHub Actions secrets for Vercel deploy (requires admin on cheltaxi-lgtm/aura-ai).
# Usage (PowerShell):
#   $env:VERCEL_TOKEN = "..."
#   $env:VERCEL_ORG_ID = "team_..."
#   $env:VERCEL_PROJECT_ID = "prj_..."
#   .\scripts\setup-github-secrets.ps1
#
# Or pass inline:
#   .\scripts\setup-github-secrets.ps1 -VercelToken "..." -VercelOrgId "..." -VercelProjectId "..."

param(
  [string]$VercelToken = $env:VERCEL_TOKEN,
  [string]$VercelOrgId = $env:VERCEL_ORG_ID,
  [string]$VercelProjectId = $env:VERCEL_PROJECT_ID,
  [string]$Repo = "cheltaxi-lgtm/aura-ai"
)

$ErrorActionPreference = "Stop"

function Get-GitHubToken {
  $cred = ("protocol=https`nhost=github.com`n" | git credential fill)
  $token = ($cred -split "`n" | Where-Object { $_ -like "password=*" } | ForEach-Object { $_ -replace "^password=", "" })
  if (-not $token) { throw "GitHub token not found. Run: gh auth login" }
  return $token
}

function Set-GitHubSecret {
  param([string]$Name, [string]$Value, [string]$GhToken, [hashtable]$PublicKey)
  Add-Type -AssemblyName System.Security
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $rsa = [System.Security.Cryptography.RSA]::Create()
  $rsa.ImportSubjectPublicKeyInfo([Convert]::FromBase64String($PublicKey.key), [ref]0)
  $encrypted = $rsa.Encrypt($bytes, [System.Security.Cryptography.RSASencryptionPadding]::OaepSHA1)
  $encryptedB64 = [Convert]::ToBase64String($encrypted)
  $body = @{ encrypted_value = $encryptedB64; key_id = $PublicKey.key_id } | ConvertTo-Json
  $headers = @{
    Authorization = "Bearer $GhToken"
    Accept        = "application/vnd.github+json"
  }
  Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Repo/actions/secrets/$Name" -Headers $headers -Body $body -ContentType "application/json"
  Write-Host "  set $Name"
}

if (-not $VercelToken -or -not $VercelOrgId -or -not $VercelProjectId) {
  Write-Host @"
Missing Vercel credentials. Set env vars or parameters:
  VERCEL_TOKEN       — https://vercel.com/account/tokens
  VERCEL_ORG_ID      — .vercel/project.json or Vercel team settings
  VERCEL_PROJECT_ID  — .vercel/project.json

Production zovus.ru is deployed via proxmox-setup/direct_deploy.ps1 (VM), not Vercel.
GitHub Deploy workflow needs these secrets only if you use Vercel as a deploy target.
"@
  exit 1
}

$gh = Get-GitHubToken
$headers = @{ Authorization = "Bearer $gh"; Accept = "application/vnd.github+json" }
$pub = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/actions/secrets/public-key" -Headers $headers

Set-GitHubSecret -Name "VERCEL_TOKEN" -Value $VercelToken -GhToken $gh -PublicKey $pub
Set-GitHubSecret -Name "VERCEL_ORG_ID" -Value $VercelOrgId -GhToken $gh -PublicKey $pub
Set-GitHubSecret -Name "VERCEL_PROJECT_ID" -Value $VercelProjectId -GhToken $gh -PublicKey $pub

Write-Host "Done. Re-run Deploy workflow: https://github.com/$Repo/actions/workflows/deploy.yml"
