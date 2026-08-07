BEGIN;

-- Practitioner public mini-landing (Avito → /p/{brand_slug}).
-- Isolated in pro.*; no FK into public.*.

CREATE TABLE IF NOT EXISTS pro.landings (
  account_id BIGINT PRIMARY KEY REFERENCES pro.accounts(id) ON DELETE CASCADE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  headline TEXT,
  subheadline TEXT,
  promo_badge TEXT,
  price_rub INTEGER
    CHECK (price_rub IS NULL OR (price_rub >= 0 AND price_rub <= 1000000)),
  promo_limit INTEGER
    CHECK (promo_limit IS NULL OR (promo_limit >= 0 AND promo_limit <= 100000)),
  promo_used INTEGER NOT NULL DEFAULT 0
    CHECK (promo_used >= 0 AND promo_used <= 100000),
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_note TEXT,
  intake_form_id BIGINT REFERENCES pro.intake_forms(id) ON DELETE SET NULL,
  -- Raw intake capability path (/pro/f/zf_…) — only recoverable at mint time.
  intake_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_landings_published_idx
  ON pro.landings (published)
  WHERE published = TRUE;

COMMENT ON TABLE pro.landings IS
  'Public mini-landing content per Pro account; CTA binds to intake_url';

COMMIT;
