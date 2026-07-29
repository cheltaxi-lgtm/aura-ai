-- Wordstat run history + per-phrase points (append-only).
-- Rollback: DROP TABLE ads.wordstat_phrase_point; DROP TABLE ads.wordstat_run;

CREATE TABLE IF NOT EXISTS ads.wordstat_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  region INTEGER NOT NULL DEFAULT 225,
  seeds TEXT[] NOT NULL DEFAULT '{}',
  phrase_count INTEGER NOT NULL DEFAULT 0,
  in_theme_count INTEGER NOT NULL DEFAULT 0,
  in_band_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  risen_count INTEGER NOT NULL DEFAULT 0,
  fallen_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,
  median_shows_theme INTEGER,
  max_shows INTEGER NOT NULL DEFAULT 0,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ads_wordstat_run_fetched_idx
  ON ads.wordstat_run (fetched_at DESC);

CREATE INDEX IF NOT EXISTS ads_wordstat_run_ok_fetched_idx
  ON ads.wordstat_run (ok, fetched_at DESC);

CREATE TABLE IF NOT EXISTS ads.wordstat_phrase_point (
  run_id UUID NOT NULL REFERENCES ads.wordstat_run (id) ON DELETE CASCADE,
  phrase_norm TEXT NOT NULL,
  phrase TEXT NOT NULL,
  shows INTEGER NOT NULL,
  seeds TEXT[] NOT NULL DEFAULT '{}',
  bucket TEXT NOT NULL DEFAULT 'with'
    CHECK (bucket IN ('with', 'also')),
  in_theme BOOLEAN NOT NULL DEFAULT FALSE,
  in_band BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (run_id, phrase_norm)
);

CREATE INDEX IF NOT EXISTS ads_wordstat_phrase_point_theme_idx
  ON ads.wordstat_phrase_point (run_id, in_theme, shows DESC);
