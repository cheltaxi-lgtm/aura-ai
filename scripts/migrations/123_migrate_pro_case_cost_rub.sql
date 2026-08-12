-- Zovus Pro: estimated AI spend (RUB) accumulated per case.
-- Estimate = text volume x live OpenRouter catalog price; telemetry for the
-- practitioner billing page, not an invoice.
-- Rollback: ALTER TABLE pro.cases DROP COLUMN IF EXISTS ai_cost_rub;

BEGIN;

DO $$
BEGIN
  IF to_regclass('pro.cases') IS NULL THEN
    RAISE NOTICE 'pro.cases missing — skip ai_cost_rub';
    RETURN;
  END IF;

  ALTER TABLE pro.cases
    ADD COLUMN IF NOT EXISTS ai_cost_rub NUMERIC(10,2) NOT NULL DEFAULT 0;
END $$;

COMMIT;
