-- Account-level last visit. Admin users list + reengagement already expect this column.
-- Historical rows are backfilled from OAuth / Telegram identity logins.

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE user_accounts ua
SET last_login_at = src.last_login_at
FROM (
  SELECT user_account_id, MAX(last_login_at) AS last_login_at
  FROM (
    SELECT user_account_id, last_login_at FROM user_oauth_identities
    UNION ALL
    SELECT user_account_id, last_login_at FROM user_telegram_identities
  ) identities
  WHERE last_login_at IS NOT NULL
  GROUP BY user_account_id
) src
WHERE ua.id = src.user_account_id
  AND ua.last_login_at IS NULL;
