-- Additive only. Never modifies balances or existing notes; delivery remains ENV-gated.
-- Older schema.sql snapshots omitted migration 038's existing metrics table.
CREATE TABLE IF NOT EXISTS spread_metrics (
  id BIGSERIAL PRIMARY KEY,event TEXT NOT NULL,spread_id TEXT NOT NULL,intention TEXT,
  character_id TEXT,card_count INT,cost INT,source TEXT,user_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_bonus_version TEXT;

-- Baseline accounts that existed before this rollout. Some legacy profiles have
-- neither a starter ledger row nor starter_runes_granted=TRUE; leaving them
-- eligible would change their balance on the next cabinet/profile read.
-- This marker changes eligibility only and never writes rune_balance.
UPDATE users u
SET starter_runes_granted = TRUE,
    starter_bonus_version = COALESCE(u.starter_bonus_version, 'legacy-no-starter-grant')
WHERE u.starter_runes_granted = FALSE
  AND EXISTS (
    SELECT 1
    FROM user_accounts ua
    WHERE ua.profile_user_id = u.id
  );

ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reading_id UUID;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reading_kind TEXT;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reading_completed_at TIMESTAMPTZ;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS weekly_step TEXT NOT NULL DEFAULT '';
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reflection TEXT NOT NULL DEFAULT '';
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reminder_consent_at TIMESTAMPTZ;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reminder_timezone TEXT;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS reminder_channel TEXT CHECK (reminder_channel IN ('email','telegram'));
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS followup_2_claimed_at TIMESTAMPTZ;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS followup_7_claimed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS diary_reading_once ON diary_entries(user_id,reading_id) WHERE reading_id IS NOT NULL;
ALTER TABLE spread_metrics ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE spread_metrics ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS spread_metric_once ON spread_metrics(user_id,event,idempotency_key) WHERE idempotency_key IS NOT NULL;
