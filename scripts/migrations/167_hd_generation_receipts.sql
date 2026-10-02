-- Generation leases fence late writers; semantic identity belongs to the
-- immutable purchase, not to an editable live chart.
ALTER TABLE hd_reports ADD COLUMN IF NOT EXISTS generation_revision UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE hd_reports ADD COLUMN IF NOT EXISTS semantic_identity TEXT;
ALTER TABLE hd_composite_reports ADD COLUMN IF NOT EXISTS generation_revision UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE hd_composite_reports ADD COLUMN IF NOT EXISTS semantic_identity TEXT;

ALTER TABLE hd_reports ADD COLUMN IF NOT EXISTS generation_context JSONB;
ALTER TABLE hd_composite_reports ADD COLUMN IF NOT EXISTS generation_context JSONB;

CREATE INDEX IF NOT EXISTS hd_reports_semantic_identity_idx ON hd_reports(user_id,semantic_identity);
CREATE INDEX IF NOT EXISTS hd_composite_semantic_identity_idx ON hd_composite_reports(user_id,semantic_identity);

-- Revoked accounts accept only settlement of an existing own spend. All
-- creation of new personal data and all other parent mutations stay fenced.
CREATE OR REPLACE FUNCTION enforce_erasure_reference_fence() RETURNS trigger AS $$
DECLARE parent_id UUID; requested TIMESTAMPTZ;
BEGIN
  parent_id := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
  IF parent_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>TG_ARGV[1]) IS NOT DISTINCT FROM (to_jsonb(NEW)->>TG_ARGV[1]) THEN RETURN NEW; END IF;
  EXECUTE format('SELECT erasure_requested_at FROM %I WHERE id=$1 FOR SHARE',TG_ARGV[0]) INTO requested USING parent_id;
  IF requested IS NOT NULL THEN
    IF TG_TABLE_NAME='rune_transactions' AND TG_OP='INSERT' AND to_jsonb(NEW)->>'type'='refund'
      AND (to_jsonb(NEW)->>'amount')::integer=0 AND EXISTS (
        SELECT 1 FROM rune_transactions source WHERE source.id=(to_jsonb(NEW)->>'refund_of_transaction_id')::uuid
        AND source.user_id=parent_id AND source.type='spend' AND source.amount<0
      ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'account_erasure_pending' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_erasure_parent_fence() RETURNS trigger AS $$
BEGIN
  IF OLD.erasure_requested_at IS NOT NULL THEN
    IF TG_TABLE_NAME='users' AND
      (to_jsonb(NEW)-'rune_balance') IS NOT DISTINCT FROM (to_jsonb(OLD)-'rune_balance') AND
      (to_jsonb(NEW)->>'rune_balance')::integer>(to_jsonb(OLD)->>'rune_balance')::integer AND EXISTS (
        SELECT 1 FROM rune_transactions refund JOIN rune_transactions source ON source.id=refund.refund_of_transaction_id
        WHERE refund.user_id=(to_jsonb(OLD)->>'id')::uuid AND source.user_id=refund.user_id
          AND refund.type='refund' AND refund.amount=0 AND source.type='spend' AND source.amount<0
          AND refund.xmin::text::bigint=mod(txid_current(),4294967296)
          AND refund.balance_after=(to_jsonb(OLD)->>'rune_balance')::integer
          AND (to_jsonb(NEW)->>'rune_balance')::integer-(to_jsonb(OLD)->>'rune_balance')::integer=-source.amount
      ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'account_erasure_pending' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
