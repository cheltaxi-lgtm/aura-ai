-- Global rune ledger audit (run on prod: psql ... -f scripts/audit-rune-ledger.sql)
-- Checks balance reconciliation, achievement idempotency, daily bonus, purchases.

\echo '=== SUMMARY ==='
SELECT COUNT(DISTINCT user_id) AS users_with_tx FROM rune_transactions;
SELECT COUNT(*) AS total_profiles FROM users;

\echo '=== BALANCE vs LEDGER SUM ==='
WITH ledger AS (
  SELECT user_id, COALESCE(SUM(amount), 0)::bigint AS ledger_sum
  FROM rune_transactions GROUP BY user_id
)
SELECT
  COUNT(*) FILTER (WHERE u.rune_balance = COALESCE(l.ledger_sum, 0)) AS ok,
  COUNT(*) FILTER (WHERE u.rune_balance <> COALESCE(l.ledger_sum, 0)) AS mismatch
FROM users u
LEFT JOIN ledger l ON l.user_id = u.id
WHERE u.rune_balance <> 0 OR l.user_id IS NOT NULL;

\echo '=== MISMATCHES (email, balance, ledger, diff) ==='
WITH ledger AS (
  SELECT user_id, COALESCE(SUM(amount), 0)::bigint AS ledger_sum
  FROM rune_transactions GROUP BY user_id
)
SELECT COALESCE(ua.email, '(no account)') AS email,
       u.rune_balance, COALESCE(l.ledger_sum, 0) AS ledger_sum,
       u.rune_balance - COALESCE(l.ledger_sum, 0) AS diff
FROM users u
LEFT JOIN ledger l ON l.user_id = u.id
LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
WHERE u.rune_balance <> COALESCE(l.ledger_sum, 0)
ORDER BY ABS(u.rune_balance - COALESCE(l.ledger_sum, 0)) DESC;

\echo '=== INCOME BY TYPE ==='
SELECT type, COUNT(*) AS cnt, SUM(amount)::bigint AS total
FROM rune_transactions WHERE amount > 0
GROUP BY type ORDER BY total DESC;

\echo '=== OVERPAID ACHIEVEMENTS (paid > expected bonus) ==='
WITH expected AS (
  SELECT 'first_message' AS k, 10 AS bonus UNION ALL
  SELECT 'week_streak', 25 UNION ALL SELECT 'loyal_master', 20 UNION ALL
  SELECT 'brave_question', 10 UNION ALL SELECT 'month_in', 50
),
paid AS (
  SELECT user_id,
    COALESCE(action_type,
      CASE
        WHEN description LIKE '%Первый шаг%' THEN 'first_message'
        WHEN description LIKE '%Искатель%' THEN 'week_streak'
        WHEN description LIKE '%Доверенный%' THEN 'loyal_master'
        WHEN description LIKE '%Смелый%' THEN 'brave_question'
        WHEN description LIKE '%Постоянный%' THEN 'month_in'
      END
    ) AS achievement_key,
    SUM(amount)::int AS paid_total
  FROM rune_transactions
  WHERE type IN ('achievement','bonus')
    AND (description LIKE 'Достижение:%' OR action_type IS NOT NULL)
  GROUP BY user_id, achievement_key
)
SELECT COALESCE(ua.email, p.user_id::text) AS who,
       p.achievement_key, e.bonus AS expected, p.paid_total,
       p.paid_total - e.bonus AS overpay
FROM paid p
JOIN expected e ON e.k = p.achievement_key
LEFT JOIN user_accounts ua ON ua.profile_user_id = p.user_id
WHERE p.paid_total > e.bonus
ORDER BY overpay DESC;

\echo '=== ACHIEVEMENT CREDIT WITHOUT user_achievements ROW ==='
SELECT COALESCE(ua.email, rt.user_id::text) AS who,
       rt.type, rt.amount, rt.description, rt.created_at::date
FROM rune_transactions rt
LEFT JOIN user_accounts ua ON ua.profile_user_id = rt.user_id
WHERE rt.type IN ('achievement','bonus')
  AND rt.description LIKE 'Достижение:%'
  AND NOT EXISTS (
    SELECT 1 FROM user_achievements ua2
    WHERE ua2.user_id = rt.user_id
      AND ua2.achievement = COALESCE(rt.action_type,
        CASE
          WHEN rt.description LIKE '%Первый шаг%' THEN 'first_message'
          WHEN rt.description LIKE '%Искатель%' THEN 'week_streak'
          WHEN rt.description LIKE '%Доверенный%' THEN 'loyal_master'
          WHEN rt.description LIKE '%Смелый%' THEN 'brave_question'
          WHEN rt.description LIKE '%Постоянный%' THEN 'month_in'
        END)
  );

\echo '=== STARTER RUNES MISSING (registered account, no starter tx) ==='
SELECT ua.email, u.starter_runes_granted, u.rune_balance
FROM users u
JOIN user_accounts ua ON ua.profile_user_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM rune_transactions rt
  WHERE rt.user_id = u.id AND rt.description LIKE 'Стартовый пакет%'
);

\echo '=== DAILY BONUS SAME-DAY DUPLICATES ==='
SELECT user_id, DATE(created_at) AS d, COUNT(*) AS cnt
FROM rune_transactions WHERE type = 'daily_bonus'
GROUP BY user_id, DATE(created_at)
HAVING COUNT(*) > 1;
