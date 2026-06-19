#!/bin/bash
# AuraAI — начальная настройка Ubuntu VM
# Запускать внутри VM: sudo bash init_ubuntu.sh

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo ">>> Обновление системы..."
apt-get update -y
apt-get upgrade -y

echo ">>> Установка базовых пакетов..."
apt-get install -y \
  curl \
  git \
  ca-certificates \
  gnupg \
  lsb-release \
  ufw \
  qemu-guest-agent

systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent

echo ">>> Установка Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker "${SUDO_USER:-$USER}" 2>/dev/null || true

echo ">>> Установка Node.js v22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo ">>> Установка pnpm..."
npm install -g pnpm@latest

echo ">>> Настройка UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 3000/tcp comment 'Next.js dev'
ufw --force enable

echo ""
echo ">>> Установка завершена!"
echo "    Docker:          $(docker --version)"
echo "    Docker Compose:  $(docker compose version)"
echo "    Node.js:         $(node --version)"
echo "    pnpm:            $(pnpm --version)"
echo "    UFW:             порты 22, 80, 443, 3000 открыты"
echo ""
echo "Перелогиньтесь для применения группы docker, затем:"
echo "  git clone <repo> && cd aura-ai"
echo "  docker compose up -d"
echo "  pnpm install && pnpm dev"
