# Bind aura-ai to GitHub: auth check, create private repo, add origin, push master.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-github-remote.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup-github-remote.ps1 -RepoName zovus -Push

param(
  [string]$RepoName = "aura-ai",
  [switch]$Push,
  [switch]$Public
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Require-GhAuth {
  gh auth status *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub CLI is not authenticated." -ForegroundColor Yellow
    Write-Host "Run: gh auth login -h github.com -p https -w" -ForegroundColor Cyan
    exit 1
  }
}

Require-GhAuth

$visibility = if ($Public) { "--public" } else { "--private" }
$remoteUrl = gh api user --jq .login
if (-not $remoteUrl) { throw "Could not read GitHub username" }
$fullName = "$remoteUrl/$RepoName"

Write-Host "GitHub user: $remoteUrl"
Write-Host "Target repo: $fullName ($($Public ? 'public' : 'private'))"

if (git remote get-url origin 2>$null) {
  Write-Host "Remote origin already set:" (git remote get-url origin)
} else {
  gh repo create $RepoName $visibility --source=. --remote=origin --description "Zovus production app (Next.js)"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Created repo and added origin." -ForegroundColor Green
}

if ($Push) {
  git push -u origin master
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Pushed master -> origin/master" -ForegroundColor Green
} else {
  Write-Host "Remote ready. Push manually: git push -u origin master" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Done. Remote:" (git remote -v)
