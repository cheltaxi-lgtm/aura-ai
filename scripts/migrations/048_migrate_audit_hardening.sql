-- Audit hardening: payments user_id backfill, share_snapshots cascade, amount check.

-- Backfill payments.user_id from owning session.
UPDATE payments p
SET user_id = s.user_id
FROM sessions s
WHERE p.session_id = s.id
  AND p.user_id IS NULL
  AND s.user_id IS NOT NULL;

-- Orphan payments without a resolvable user stay NULL (ON DELETE SET NULL).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Share snapshots must not outlive the user account.
ALTER TABLE share_snapshots DROP CONSTRAINT IF EXISTS share_snapshots_user_id_fkey;
ALTER TABLE share_snapshots
  ADD CONSTRAINT share_snapshots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Guard against zero/negative payment amounts.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
