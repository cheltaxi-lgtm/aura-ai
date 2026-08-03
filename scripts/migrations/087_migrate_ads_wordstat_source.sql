-- Allow Wordstat snapshots in ads.source_snapshot.
-- Rollback: recreate check without 'wordstat'.

ALTER TABLE ads.source_snapshot DROP CONSTRAINT IF EXISTS source_snapshot_source_check;
ALTER TABLE ads.source_snapshot
  ADD CONSTRAINT source_snapshot_source_check
  CHECK (source IN ('direct','metrika','webmaster','health','wordstat'));
