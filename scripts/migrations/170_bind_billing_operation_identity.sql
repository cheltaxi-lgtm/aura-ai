-- Optional server identity distinguishes a purchase from an arbitrary old client key.
ALTER TABLE rune_transactions ADD COLUMN IF NOT EXISTS operation_identity TEXT;
