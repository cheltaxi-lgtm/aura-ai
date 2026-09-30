-- Read-only aggregate diagnostics. No repairs, no personal identifiers in output.
-- Findings are investigation candidates, not proof of abuse or compensation amounts.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH ledger AS (
 SELECT user_id, SUM(amount)::bigint AS total FROM rune_transactions GROUP BY user_id
)
SELECT 'balance_reconciliation' AS check_name,
 COUNT(*) FILTER (WHERE u.rune_balance <> COALESCE(l.total,0)) AS mismatched_profiles,
 COALESCE(SUM(ABS(u.rune_balance-COALESCE(l.total,0))) FILTER
   (WHERE u.rune_balance <> COALESCE(l.total,0)),0) AS absolute_difference_runes
FROM users u LEFT JOIN ledger l ON l.user_id=u.id;

WITH daily AS (
 SELECT user_id,created_at,
 LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at,id) AS previous_at
 FROM rune_transactions WHERE type='daily_bonus' AND amount>0
)
SELECT 'daily_rolling_24h' AS check_name, COUNT(*) AS suspicious_adjacent_pairs,
 COUNT(DISTINCT user_id) AS affected_profiles
FROM daily WHERE created_at-previous_at < INTERVAL '24 hours';

SELECT 'eligible_but_rate_limited' AS check_name, COUNT(DISTINCT u.id) AS profiles
FROM users u JOIN user_accounts a ON a.profile_user_id=u.id
JOIN rate_limit_buckets b ON b.bucket_key='daily_bonus:' || a.id::text
WHERE (u.last_daily_bonus IS NULL OR u.last_daily_bonus<=NOW()-INTERVAL '24 hours')
 AND b.reset_at>NOW() AND b.count>=1;

WITH starter AS (
 SELECT user_id,COUNT(*) AS grants FROM rune_transactions
 WHERE type='bonus' AND amount>0 AND description LIKE 'Стартовый пакет%'
 GROUP BY user_id
)
SELECT 'starter_markers' AS check_name,
 COUNT(*) FILTER (WHERE COALESCE(s.grants,0)>1) AS multiple_grants,
 COUNT(*) FILTER (WHERE COALESCE(s.grants,0)>0 AND NOT u.starter_runes_granted) AS missing_marker,
 COUNT(*) FILTER (WHERE COALESCE(s.grants,0)=0 AND u.starter_runes_granted) AS marker_without_matching_ledger
FROM users u LEFT JOIN starter s ON s.user_id=u.id;

-- Current source catalog; historical policy differences require manual interpretation.
WITH expected(k,amount) AS (VALUES
 ('first_message',10),('week_streak',25),('loyal_master',20),('brave_question',10),
 ('month_in',50),('ritual_first',15),('ritual_elements',50),('ritual_full_moon',20),
 ('ritual_loyal',35),('joint_first',15),('joint_loyal',30)
), paid AS (
 SELECT user_id,action_type,COUNT(*) AS grants,SUM(amount) AS amount
 FROM rune_transactions WHERE type IN ('achievement','bonus') AND amount>0
 GROUP BY user_id,action_type
)
SELECT 'achievement_catalog' AS check_name,e.k,
 COUNT(*) FILTER (WHERE p.grants>1) AS multiple_grants,
 COUNT(*) FILTER (WHERE p.amount>e.amount) AS above_current_policy
FROM expected e LEFT JOIN paid p ON p.action_type=e.k GROUP BY e.k ORDER BY e.k;

SELECT 'legacy_achievement_keys' AS check_name,COUNT(*) AS rows_requiring_legacy_mapping
FROM rune_transactions WHERE type IN ('achievement','bonus')
 AND description LIKE 'Достижение:%' AND action_type IS NULL;

SELECT 'issuance_30_days' AS check_name,type,COUNT(*) AS operations,
 COUNT(DISTINCT user_id) AS profiles,SUM(amount)::bigint AS runes
FROM rune_transactions WHERE amount>0 AND created_at>=NOW()-INTERVAL '30 days'
GROUP BY type ORDER BY type;
COMMIT;
