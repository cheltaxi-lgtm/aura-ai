-- Run on the Pro database as well when PRO_DATABASE_URL is separate.
DO $$ BEGIN
IF to_regclass('pro.cases') IS NULL THEN RETURN; END IF;
ALTER TABLE pro.cases ALTER COLUMN ai_cost_rub DROP NOT NULL;
CREATE TABLE IF NOT EXISTS pro.hd_delivery_receipts (
  job_id UUID PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  case_id BIGINT REFERENCES pro.cases(id) ON DELETE SET NULL,
  version_id BIGINT REFERENCES pro.case_versions(id) ON DELETE SET NULL,
  charge_transaction_id UUID UNIQUE,
  block_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_hd_receipts_user_charge_idx ON pro.hd_delivery_receipts(user_id,charge_transaction_id);
END $$;
