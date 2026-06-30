CREATE TABLE IF NOT EXISTS share_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT UNIQUE NOT NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('reading', 'ritual', 'daily', 'triplet', 'session')),
  payload      JSONB NOT NULL,
  view_count   INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots(token);

INSERT INTO platform_settings (key, value) VALUES
  ('share', '{"enabled":true,"expiryDays":90,"maxExcerptLength":280}'::jsonb)
ON CONFLICT (key) DO NOTHING;
