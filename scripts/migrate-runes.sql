-- Runes internal currency
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rune_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_runes_purchased INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starter_runes_granted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS rune_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'bonus', 'refund')),
  amount          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT NOT NULL,
  action_type     TEXT,
  payment_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rune_transactions_user
  ON rune_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_payment_purchase
  ON rune_transactions (payment_id)
  WHERE type = 'purchase' AND payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rune_packages (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  runes       INTEGER NOT NULL,
  price_rub   INTEGER NOT NULL,
  bonus_runes INTEGER NOT NULL DEFAULT 0,
  is_popular  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO rune_packages (id, name, runes, price_rub, bonus_runes, is_popular, sort_order)
VALUES
  ('starter',  'Искатель',    50,   99,    0,   false, 1),
  ('adept',    'Посвящённый', 150,  249,   15,  true,  2),
  ('keeper',   'Хранитель',   500,  699,   75,  false, 3),
  ('chosen',   'Избранный',   1500, 1690,  300, false, 4)
ON CONFLICT (id) DO NOTHING;
