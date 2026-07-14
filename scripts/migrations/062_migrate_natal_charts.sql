-- Natal chart cache (optional feature, isolated from users core columns).
CREATE TABLE IF NOT EXISTS natal_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  birth_lat DOUBLE PRECISION,
  birth_lon DOUBLE PRECISION,
  birth_tzid TEXT,
  birth_place_label TEXT,
  time_known BOOLEAN NOT NULL DEFAULT FALSE,
  house_system TEXT NOT NULL DEFAULT 'placidus',
  chart_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine_version TEXT NOT NULL DEFAULT 'v1',
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_charts_user ON natal_charts(user_id);
