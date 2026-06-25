-- Daily reading: store drawn cards + deck system for the 24h forecast.
-- Safe to re-run. No DROP / TRUNCATE.

ALTER TABLE daily_readings
  ADD COLUMN IF NOT EXISTS cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deck_system TEXT;
