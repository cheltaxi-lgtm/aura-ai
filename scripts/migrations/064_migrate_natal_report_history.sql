-- Versioned paid natal reports and idempotent charge refunds.
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS refund_of_transaction_id UUID
    REFERENCES rune_transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_refund_once
  ON rune_transactions(refund_of_transaction_id)
  WHERE type = 'refund' AND refund_of_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS natal_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  birth_fingerprint TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  ephemeris TEXT NOT NULL,
  tradition TEXT NOT NULL CHECK (tradition IN ('western', 'vedic')),
  report_type TEXT NOT NULL DEFAULT 'interpretation',
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  structured_data JSONB,
  evidence_refs JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  claim_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_report_history_version_unique UNIQUE (
    user_id,
    birth_fingerprint,
    engine_version,
    ephemeris,
    tradition,
    report_type
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_report_history_charge
  ON natal_report_history(charge_transaction_id)
  WHERE charge_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_natal_report_history_user_created
  ON natal_report_history(user_id, created_at DESC);

-- Preserve already-generated reports. Charge metadata is unavailable for
-- legacy rows, so those columns intentionally remain NULL.
INSERT INTO natal_report_history (
  user_id,
  birth_fingerprint,
  engine_version,
  ephemeris,
  tradition,
  report_type,
  content,
  created_at,
  updated_at
)
SELECT
  nc.user_id,
  nc.chart_data->>'birthFingerprint',
  nc.engine_version,
  COALESCE(NULLIF(nc.chart_data #>> '{western,ephemeris}', ''), 'unknown'),
  values_to_preserve.tradition,
  'interpretation',
  values_to_preserve.content,
  COALESCE(nc.computed_at, nc.created_at),
  nc.updated_at
FROM natal_charts nc
CROSS JOIN LATERAL (
  VALUES
    (
      'western',
      COALESCE(
        NULLIF(nc.chart_data #>> '{interpretations,western}', ''),
        NULLIF(nc.chart_data->>'interpretation', '')
      )
    ),
    ('vedic', NULLIF(nc.chart_data #>> '{interpretations,vedic}', ''))
) AS values_to_preserve(tradition, content)
WHERE NULLIF(nc.chart_data->>'birthFingerprint', '') IS NOT NULL
  AND values_to_preserve.content IS NOT NULL
ON CONFLICT (
  user_id,
  birth_fingerprint,
  engine_version,
  ephemeris,
  tradition,
  report_type
) DO NOTHING;
