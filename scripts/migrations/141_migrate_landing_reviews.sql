-- Public landing reviews: seeded editorial copy + user submissions pending moderation.
-- Rollback: scripts/migrations/141_migrate_landing_reviews.down.sql

CREATE TABLE IF NOT EXISTS landing_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  rating SMALLINT NOT NULL,
  author_name TEXT NOT NULL,
  city TEXT,
  product TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  user_account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  ip_hash TEXT,
  admin_note TEXT,
  moderated_by TEXT,
  moderated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_reviews_source_check
    CHECK (source IN ('seed', 'user')),
  CONSTRAINT landing_reviews_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT landing_reviews_rating_check
    CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT landing_reviews_product_check
    CHECK (product IN ('tarot', 'matrix', 'natal', 'hd', 'photo', 'general'))
);

CREATE INDEX IF NOT EXISTS idx_landing_reviews_public
  ON landing_reviews (status, published_at DESC, id DESC)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_landing_reviews_moderation
  ON landing_reviews (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_reviews_user
  ON landing_reviews (user_account_id, created_at DESC)
  WHERE user_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_landing_reviews_ip
  ON landing_reviews (ip_hash, created_at DESC)
  WHERE source = 'user';
