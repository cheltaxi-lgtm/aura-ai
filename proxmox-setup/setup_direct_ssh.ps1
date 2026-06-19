# Настройка прямого SSH с ПК на VM aura-ai-dev (Proxmox VM 900)
# 1) Ключ в authorized_keys на VM
# 2) Ключ в Proxmox cloud-init (переживёт пересоздание VM)
# 3) Запись в ~/.ssh/config

$ErrorActionPreference = "Stop"
$PubKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519.pub"
if (-not (Test-Path $PubKeyPath)) {
  Write-Error "Нет $PubKeyPath — сначала: ssh-keygen -t ed25519"
}

$JumpPass = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("Z3pPeXY5Q28qNzRfNzQ="))
$Plink = "C:\Program Files\PuTTY\plink.exe"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"
$JumpHostKey = "ssh-ed25519 255 SHA256:fRcudwBpulLElZApJRBdyg23/sQ5MnlahdtYD/MJbds"
$TmpPub = Join-Path $env:TEMP "aura-gamer.pub"
Copy-Item $PubKeyPath $TmpPub -Force

Write-Host ">>> Jump -> VM: authorized_keys"
& $Pscp -pw $JumpPass -hostkey $JumpHostKey $TmpPub "ubuntu@192.168.1.50:/tmp/aura-gamer.pub"
& $Plink -ssh "ubuntu@192.168.1.50" -pw $JumpPass -hostkey $JumpHostKey -batch `
  "scp -o StrictHostKeyChecking=no /tmp/aura-gamer.pub ubuntu@192.168.1.152:/tmp/aura-gamer.pub && ssh -o StrictHostKeyChecking=no ubuntu@192.168.1.152 'cat /tmp/aura-gamer.pub >> ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'"

Write-Host ">>> Proxmox cloud-init VM 900"
& $Plink -ssh "ubuntu@192.168.1.50" -pw $JumpPass -hostkey $JumpHostKey -batch `
  "sudo scp -o StrictHostKeyChecking=no /tmp/aura-gamer.pub root@192.168.1.52:/root/aura-gamer.pub && sudo ssh -o BatchMode=yes -o StrictHostKeyChecking=no root@192.168.1.52 'qm set 900 --sshkeys /root/aura-gamer.pub && qm cloudinit update 900'"

$SshConfig = Join-Path $env:USERPROFILE ".ssh\config"
$Block = @"

Host aura-vm
    HostName 192.168.1.152
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519

Host aura-pve
    HostName 192.168.1.52
    User root
    ProxyJump ubuntu@192.168.1.50
    IdentityFile ~/.ssh/id_ed25519

Host aura-jump
    HostName 192.168.1.50
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
"@

if (-not (Select-String -Path $SshConfig -Pattern "Host aura-vm" -Quiet -ErrorAction SilentlyContinue)) {
  Add-Content -Path $SshConfig -Value $Block
  Write-Host ">>> ~/.ssh/config updated"
} else {
  Write-Host ">>> ~/.ssh/config already has aura-vm"
}

ssh -o BatchMode=yes -o ConnectTimeout=8 ubuntu@192.168.1.152 "echo direct_ssh_ok"
Write-Host ">>> Direct SSH ready. Deploy: .\proxmox-setup\direct_deploy.ps1"
