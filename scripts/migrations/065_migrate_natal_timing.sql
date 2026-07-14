-- Cached personal timing calculations and user-controlled event delivery.
CREATE TABLE IF NOT EXISTS natal_timing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (7, 30, 90, 365)),
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  engine_version TEXT NOT NULL,
  birth_fingerprint TEXT NOT NULL,
  timing_data JSONB,
  generated_at TIMESTAMPTZ,
  claim_token UUID,
  claim_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_timing_cache_window_unique UNIQUE (
    user_id, horizon_days, window_start, engine_version, birth_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_timing_cache_user_generated
  ON natal_timing_cache(user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS natal_event_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  horizons INTEGER[] NOT NULL DEFAULT ARRAY[7, 30],
  categories TEXT[] NOT NULL DEFAULT ARRAY[
    'identity', 'emotions', 'relationships', 'career', 'growth', 'pressure', 'transformation'
  ],
  planet_importance TEXT[] NOT NULL DEFAULT ARRAY['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'],
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  push BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_event_preferences_horizons CHECK (
    horizons <@ ARRAY[7, 30, 90, 365] AND cardinality(horizons) <= 4
  ),
  CONSTRAINT natal_event_preferences_categories CHECK (
    categories <@ ARRAY[
      'identity', 'emotions', 'relationships', 'career', 'growth', 'pressure', 'transformation'
    ] AND cardinality(categories) <= 7
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_event_preferences_due
  ON natal_event_preferences(timezone, frequency, last_notified_at)
  WHERE enabled = TRUE AND in_app = TRUE;

INSERT INTO natal_event_preferences (user_id, enabled, timezone)
SELECT user_id, FALSE, COALESCE(NULLIF(birth_tzid, ''), 'UTC')
FROM natal_charts
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS natal_event_delivery_log (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_natal_event_delivery_log_delivered
  ON natal_event_delivery_log(delivered_at);
