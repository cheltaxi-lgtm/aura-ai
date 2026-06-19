#!/bin/bash
# AuraAI — создание dev-VM на Proxmox VE
# Запускать на хосте Proxmox: bash create_vm.sh

set -euo pipefail

VMID=900
VM_NAME="aura-ai-prod"
CORES=4
MEMORY=4096
DISK_SIZE="40G"
STORAGE="local-lvm"
BRIDGE="vmbr0"
ISO_STORAGE="local"
UBUNTU_ISO="ubuntu-24.04-live-server-amd64.iso"

if qm status "$VMID" &>/dev/null; then
  echo "VM $VMID уже существует. Удалите её или измените VMID."
  exit 1
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
  --net0 "virtio,bridge=${BRIDGE},firewall=1"

qm set "$VMID" --scsi0 "${STORAGE}:${DISK_SIZE},discard=on,ssd=1"
qm set "$VMID" --ide2 "${ISO_STORAGE}:iso/${UBUNTU_ISO},media=cdrom"
qm set "$VMID" --boot "order=ide2;scsi0"
qm set "$VMID" --serial0 socket
qm set "$VMID" --vga std

echo ""
echo ">>> VM $VMID создана усп"
echo "    Имя:      $VM_NAME"
echo "    CPU:      $CORES ядра (host)"
echo "    RAM:      ${MEMORY} MB"
echo "    Диск:     ${DISK_SIZE} на $STORAGE"
echo "    Сеть:     $BRIDGE"
echo "    Agent:    QEMU Guest Agent включён"
echo ""
echo "Следующие шаги:"
echo "  1. qm start $VMID"
echo "  2. Установите Ubuntu Server через консоль Proxmox"
echo "  3. Скопируйте init_ubuntu.sh в VM и выполните: sudo bash init_ubuntu.sh"
