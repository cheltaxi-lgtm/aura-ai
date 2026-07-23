#!/bin/bash
# Idempotently install Zovus background crons into the ubuntu user's crontab.
# Re-running replaces the managed block (delimited by the markers below), so it
# is safe to call on every deploy. Logs land in /opt/aura-ai/logs.
set -euo pipefail

REPO="/opt/aura-ai"
LOG_DIR="$REPO/logs"
MARK_BEGIN="# >>> zovus-crons >>>"
MARK_END="# <<< zovus-crons <<<"

mkdir -p "$LOG_DIR"
chmod +x "$REPO/proxmox-setup/cron-memory-maintenance.sh" \
         "$REPO/proxmox-setup/cron-memory-extract.sh" \
         "$REPO/proxmox-setup/cron-proactive-reminders.sh" \
         "$REPO/proxmox-setup/cron-daily-reading-remind.sh" \
         "$REPO/proxmox-setup/cron-reengagement-emails.sh" \
         "$REPO/proxmox-setup/cron-reconcile-rune-payments.sh" \
         "$REPO/proxmox-setup/cron-pg-backup.sh" \
         "$REPO/proxmox-setup/cron-cleanup-empty-sessions.sh" \
         "$REPO/proxmox-setup/cron-joint-reading-sweep.sh" \
         "$REPO/proxmox-setup/cron-guest-resume-expire.sh" \
         "$REPO/proxmox-setup/cron-natal-transits.sh" 2>/dev/null || true

CURRENT="$(crontab -l 2>/dev/null || true)"
# Drop any previously-managed block, keep everything else untouched.
CLEANED="$(printf '%s\n' "$CURRENT" | sed "/${MARK_BEGIN}/,/${MARK_END}/d")"

{
  printf '%s\n' "$CLEANED" | sed '/^$/d'
  echo "$MARK_BEGIN"
  # Daily memory maintenance (re-embed facts missing vectors) — 03:15.
  echo "15 3 * * * $REPO/proxmox-setup/cron-memory-maintenance.sh >> $LOG_DIR/memory.log 2>&1"
  # Durable memory extraction outbox — every 5 minutes.
  echo "*/5 * * * * $REPO/proxmox-setup/cron-memory-extract.sh >> $LOG_DIR/memory-extract.log 2>&1"
  # Proactive reminders (ritual follow-ups + upcoming events) — 09:30 daily.
  echo "30 9 * * * $REPO/proxmox-setup/cron-proactive-reminders.sh >> $LOG_DIR/reminders.log 2>&1"
  # Daily reading reminders (in-app + email) — every hour UTC.
  echo "0 * * * * $REPO/proxmox-setup/cron-daily-reading-remind.sh >> $LOG_DIR/daily-remind.log 2>&1"
  # Re-engagement emails (bonus runes 19 MSK, win-back 10 MSK) — every hour UTC.
  echo "5 * * * * $REPO/proxmox-setup/cron-reengagement-emails.sh >> $LOG_DIR/reengagement.log 2>&1"
  # Missed YooKassa rune purchase reconciliation — every 15 minutes.
  echo "*/15 * * * * $REPO/proxmox-setup/cron-reconcile-rune-payments.sh >> $LOG_DIR/rune-reconcile.log 2>&1"
  # PostgreSQL backup — daily at 02:45 UTC.
  echo "45 2 * * * $REPO/proxmox-setup/cron-pg-backup.sh >> $LOG_DIR/pg-backup.log 2>&1"
  # Empty consultation stubs (no chat / intention) — daily at 04:10 UTC.
  echo "10 4 * * * $REPO/proxmox-setup/cron-cleanup-empty-sessions.sh >> $LOG_DIR/session-cleanup.log 2>&1"
  # Joint-reading expiry sweep + partner-not-started reminders — daily at 05:20 UTC.
  echo "20 5 * * * $REPO/proxmox-setup/cron-joint-reading-sweep.sh >> $LOG_DIR/joint-reading-sweep.log 2>&1"
  # Guest triplet resume TTL — expire unclaimed issued receipts — daily at 05:35 UTC.
  echo "35 5 * * * $REPO/proxmox-setup/cron-guest-resume-expire.sh >> $LOG_DIR/guest-resume-expire.log 2>&1"
  # Natal transit digest — hourly; route selects 09:00 in each birth-place timezone.
  echo "15 * * * * $REPO/proxmox-setup/cron-natal-transits.sh >> $LOG_DIR/natal-transits.log 2>&1"
  echo "$MARK_END"
} | crontab -

echo "Installed zovus crons:"
crontab -l | sed -n "/${MARK_BEGIN}/,/${MARK_END}/p"
