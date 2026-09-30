-- Snapshot future legacy subscription obligations. Existing successful orders are
-- deliberately not replayed: their access may already have been delivered.
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS bonus_email_verification_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_bonus_runes INTEGER
  CHECK (subscription_bonus_runes >= 0);
UPDATE payments SET subscription_bonus_runes = CASE WHEN payment_type='subscription'
  AND COALESCE((SELECT (value->>'enabled')::boolean FROM platform_settings WHERE key='runes'),TRUE)
  THEN FLOOR(amount / GREATEST(0.1,COALESCE((SELECT (value->>'rubPerRune')::numeric
    FROM platform_settings WHERE key='runes'),5)))::integer ELSE 0 END
WHERE subscription_bonus_runes IS NULL AND status='pending';
