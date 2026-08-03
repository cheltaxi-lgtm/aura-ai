-- Buy-once Full Matrix reports (destiny_matrix) keyed by user + birth date.
CREATE TABLE IF NOT EXISTS numerology_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  birth_date DATE NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'matrix-v1',
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  structured_data JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT numerology_report_history_version_unique UNIQUE (
    user_id,
    tool_id,
    birth_date,
    calculation_version
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_numerology_report_history_charge
  ON numerology_report_history(charge_transaction_id)
  WHERE charge_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_user_created
  ON numerology_report_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_user_tool_birth
  ON numerology_report_history(user_id, tool_id, birth_date);

-- Best-effort backfill: prior paid destiny_matrix readings become buy-once unlocks.
INSERT INTO numerology_report_history (
  user_id,
  tool_id,
  birth_date,
  calculation_version,
  content,
  rune_cost,
  created_at,
  updated_at
)
SELECT DISTINCT ON (h.user_id, (h.context_data->>'birthDate')::date)
  h.user_id,
  'destiny_matrix',
  (h.context_data->>'birthDate')::date,
  'matrix-v1',
  h.context_data->>'reading',
  NULL,
  h.created_at,
  h.created_at
FROM history h
WHERE h.context_data->>'type' = 'reading'
  AND h.context_data->>'numerologToolId' = 'destiny_matrix'
  AND h.is_paid = TRUE
  AND NULLIF(btrim(h.context_data->>'reading'), '') IS NOT NULL
  AND NULLIF(btrim(h.context_data->>'birthDate'), '') IS NOT NULL
  AND (h.context_data->>'birthDate') ~ '^\d{4}-\d{2}-\d{2}'
ORDER BY h.user_id, (h.context_data->>'birthDate')::date, h.created_at DESC
ON CONFLICT (user_id, tool_id, birth_date, calculation_version) DO NOTHING;
