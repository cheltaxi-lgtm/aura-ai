-- Re-link a user account to its astro profile when profile_user_id was cleared by duplicate healing.
-- Usage (replace email and run inside postgres):
--   docker exec -i auraai-postgres psql -U auraai -d auraai < scripts/heal-account-profile-link.sql
--
-- Set target email:
\set account_email 'cheltaxi@gmail.com'

UPDATE user_accounts ua
SET profile_user_id = sub.profile_id
FROM (
  SELECT ua2.id AS account_id,
         (
           SELECT u.id
           FROM users u
           JOIN user_history h ON h.user_id = u.id
           WHERE h.character_name = 'triplet'
           ORDER BY h.created_at DESC
           LIMIT 1
         ) AS profile_id
  FROM user_accounts ua2
  WHERE lower(ua2.email) = lower(:'account_email')
) sub
WHERE ua.id = sub.account_id
  AND ua.profile_user_id IS NULL
  AND sub.profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_accounts other
    WHERE other.profile_user_id = sub.profile_id AND other.id <> ua.id
  );

SELECT id, email, name, profile_user_id FROM user_accounts WHERE lower(email) = lower(:'account_email');
