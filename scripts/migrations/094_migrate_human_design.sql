-- Human Design module: charts, paid reports, follow-up questions.
BEGIN;

CREATE TABLE IF NOT EXISTS hd_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guest_id TEXT,
  birth_date DATE NOT NULL,
  birth_time TEXT,
  time_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL,
  place_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  chart JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hd_charts_user ON hd_charts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hd_charts_guest ON hd_charts(guest_id) WHERE guest_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hd_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','error')),
  report_text TEXT,
  model TEXT,
  transaction_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One paid report per chart: the unique index doubles as the idempotency key
-- (concurrent purchases collide on INSERT instead of double-charging).
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_reports_chart ON hd_reports(chart_id);
CREATE INDEX IF NOT EXISTS idx_hd_reports_user ON hd_reports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hd_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES hd_reports(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hd_report_messages_report ON hd_report_messages(report_id, created_at);

COMMIT;
