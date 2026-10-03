-- Shared durable generation receipt for every active Pro practice.
DO $$ BEGIN
IF to_regclass('pro.hd_delivery_receipts') IS NULL THEN RETURN; END IF;
ALTER TABLE pro.hd_delivery_receipts ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT 'hd';
END $$;
