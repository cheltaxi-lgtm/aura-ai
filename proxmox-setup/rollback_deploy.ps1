# Roll back production to a saved deploy snapshot (does not touch .env.local secrets).
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

$VmHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { "root@217.12.37.32" }
$DefaultKey = Join-Path $env:USERPROFILE ".ssh\aura_deploy_ed25519"
$SshKey = if ($env:DEPLOY_SSH_KEY) { $env:DEPLOY_SSH_KEY } elseif (Test-Path $DefaultKey) { $DefaultKey } else { $null }

function Get-SshBaseArgs {
  $args = @("-o", "StrictHostKeyChecking=no")
  if ($SshKey) { $args += @("-i", $SshKey) }
  return $args
}

$Action = if ($args.Count -gt 0) { $args[0] } else { "list" }
$Name = if ($args.Count -gt 1) { $args[1] } else { "" }

$RemoteCmd = switch ($Action) {
  "save" { "bash /opt/aura-ai/hosting/rollback-deploy.sh save deploy" }
  "restore" {
    if (-not $Name) { throw "Usage: rollback_deploy.ps1 restore <snapshot-name>" }
    "bash /opt/aura-ai/hosting/rollback-deploy.sh restore $Name"
  }
  default { "bash /opt/aura-ai/hosting/rollback-deploy.sh list" }
}

$sshArgs = @(Get-SshBaseArgs) + @($VmHost, $RemoteCmd)
& ssh.exe @sshArgs
