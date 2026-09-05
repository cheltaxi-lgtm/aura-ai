ALTER TABLE bot_processed_updates ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE bot_processed_updates ADD COLUMN owner_id TEXT;
