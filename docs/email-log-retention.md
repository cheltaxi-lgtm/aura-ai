# Email diagnostic retention

`email_log.owner_account_ids` records account ownership before awaiting delivery. Account erasure removes the owned row even when the recipient address has changed. Migration 172 backfills rows that can still be matched to current account, contact or OAuth addresses; it does not reconstruct discarded historical identity data.

Rows with an empty owner array include older unmatched recipients and operational mailboxes. They are diagnostic data, not durable account history. The hourly `GET /api/cron/email-log-retention` job removes these rows after 30 days in oldest-first batches of at most 1000. It skips rows locked by another operation, supports repeated runs and leaves all owned rows and younger ownerless rows untouched. A pre-existing backlog drains gradually through successive hourly runs; deployment itself performs no bulk retention purge.

The endpoint requires the existing cron secret or an active admin session. Its response contains only the deletion count, retention duration and batch cap. `proxmox-setup/cron-email-log-retention.sh` calls the app over loopback with overlap protection; the canonical `proxmox-setup/install-crons.sh` installs it at minute 25 of every hour. The authorized deployment must reinstall that managed cron block.

Admin email stats use recent 24-hour/7-day windows, so the 30-day cleanup does not require a separate aggregate table. Per-recipient, subject, error and metadata details disappear with the deleted row. Owned records retain their existing account-erasure behavior. This bounds unmatched legacy PII; it does not claim that its original account was recovered.

Checks: real-PostgreSQL retention/locking tests and scheduler authorization tests in `tests/invariants/email-log-retention-{db,route}.test.ts`.
