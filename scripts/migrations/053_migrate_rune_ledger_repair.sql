-- Repair rune ledger / achievements / starter pack after global audit (2026-07).

-- 1) Legacy achievement credits → user_achievements (no extra runes)
INSERT INTO user_achievements (user_id, achievement, earned_at)
SELECT rt.user_id, 'brave_question', MIN(rt.created_at)
FROM rune_transactions rt
WHERE rt.type IN ('achievement', 'bonus')
  AND rt.description LIKE 'Достижение:%Смелый%'
  AND NOT EXISTS (
    SELECT 1 FROM user_achievements ua
    WHERE ua.user_id = rt.user_id AND ua.achievement = 'brave_question'
  )
GROUP BY rt.user_id
ON CONFLICT (user_id, achievement) DO NOTHING;

INSERT INTO user_achievements (user_id, achievement, earned_at)
SELECT rt.user_id, 'first_message', MIN(rt.created_at)
FROM rune_transactions rt
WHERE rt.type IN ('achievement', 'bonus')
  AND rt.description LIKE 'Достижение:%Первый шаг%'
  AND NOT EXISTS (
    SELECT 1 FROM user_achievements ua
    WHERE ua.user_id = rt.user_id AND ua.achievement = 'first_message'
  )
GROUP BY rt.user_id
ON CONFLICT (user_id, achievement) DO NOTHING;

-- 2) Starter pack for registered accounts that never received it
DO $$
DECLARE
  rec RECORD;
  starter_amt INT;
  new_bal INT;
BEGIN
  SELECT COALESCE((value->>'starterRunes')::int, 30) INTO starter_amt
  FROM platform_settings WHERE key = 'runes';
  IF starter_amt IS NULL OR starter_amt <= 0 THEN
    starter_amt := 30;
  END IF;

  FOR rec IN
    SELECT u.id AS user_id
    FROM users u
    INNER JOIN user_accounts ua ON ua.profile_user_id = u.id
    WHERE u.starter_runes_granted = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM rune_transactions rt
        WHERE rt.user_id = u.id AND rt.description LIKE 'Стартовый пакет%'
      )
  LOOP
    UPDATE users
    SET starter_runes_granted = TRUE,
        rune_balance = rune_balance + starter_amt
    WHERE id = rec.user_id
    RETURNING rune_balance INTO new_bal;

    INSERT INTO rune_transactions (user_id, type, amount, balance_after, description)
    VALUES (
      rec.user_id,
      'bonus',
      starter_amt,
      new_bal,
      'Стартовый пакет: ' || starter_amt || ' ᚢ'
    );
  END LOOP;
END $$;

-- 3) Orphan test profiles (no account, no ledger) → zero balance
UPDATE users u
SET rune_balance = 0
WHERE NOT EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.profile_user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM rune_transactions rt WHERE rt.user_id = u.id);

-- 4) Align rune_balance with ledger sum
WITH ledger AS (
  SELECT user_id, COALESCE(SUM(amount), 0)::int AS ledger_sum
  FROM rune_transactions
  GROUP BY user_id
)
UPDATE users u
SET rune_balance = l.ledger_sum
FROM ledger l
WHERE u.id = l.user_id
  AND u.rune_balance <> l.ledger_sum;
