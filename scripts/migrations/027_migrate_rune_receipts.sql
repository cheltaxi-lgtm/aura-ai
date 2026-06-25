-- Receipt toast: track which credit transactions were shown in UI
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS shown_receipt BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_unshown
  ON rune_transactions (user_id, created_at DESC)
  WHERE shown_receipt = FALSE
    AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus');
