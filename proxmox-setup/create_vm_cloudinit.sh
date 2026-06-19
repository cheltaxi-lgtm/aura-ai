#!/bin/bash
# AuraAI — создание dev-VM на Proxmox VE (cloud-init, без ISO)
# Запускать на хосте Proxmox: bash create_vm_cloudinit.sh
# Альтернатива create_vm.sh — используйте этот скрипт, если нет Ubuntu ISO.

set -euo pipefail

VMID=900
VM_NAME="aura-ai-dev"
CORES=4
MEMORY=4096
DISK_SIZE="40G"
STORAGE="local-lvm"
BRIDGE="vmbr0"
CI_USER="ubuntu"
CI_PASS="AuraAI-Dev2026!"
IMG_DIR="/var/lib/vz/template/cache"
IMG="${IMG_DIR}/noble-server-cloudimg-amd64.img"
IMG_URL="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"

if qm status "$VMID" &>/dev/null; then
  echo "VM $VMID уже существует."
  qm config "$VMID"
  exit 0
fi

echo ">>> Загрузка Ubuntu 24.04 cloud image..."
mkdir -p "$IMG_DIR"
if [ ! -f "$IMG" ]; then
  wget -q --show-progress -O "$IMG" "$IMG_URL"
fi

echo ">>> Создание VM $VMID ($VM_NAME)..."
qm create "$VMID" \
  --name "$VM_NAME" \
  --cores "$CORES" \
  --cpu host \
  --memory "$MEMORY" \
  --agent enabled=1 \
  --ostype l26 \
  --scsihw virtio-scsi-pci \
  --net0 "virtio,bridge=${BRIDGE},firewall=1" \
  --serial0 socket \
  --vga serial0

qm importdisk "$VMID" "$IMG" "$STORAGE"
qm set "$VMID" --scsi0 "${STORAGE}:vm-${VMID}-disk-0,discard=on,ssd=1"
qm set "$VMID" --ide2 "${STORAGE}:cloudinit"
qm set "$VMID" --boot "order=scsi0"
qm resize "$VMID" scsi0 "$DISK_SIZE"

qm set "$VMID" --ciuser "$CI_USER" --cipassword "$CI_PASS"
qm set "$VMID" --ipconfig0 ip=dhcp
qm set "$VMID" --nameserver 192.168.1.1
qm set "$VMID" --searchdomain local
qm cloudinit update "$VMID"

echo ">>> Запуск VM $VMID..."
qm start "$VMID"

echo ""
echo ">>> VM $VMID создана и запущена"
echo "    Пользователь: $CI_USER"
echo "    Пароль:       $CI_PASS"
echo "    Ожидайте ~60 сек для cloud-init, затем узнайте IP:"
echo "    qm guest cmd $VMID network-get-interfaces"
