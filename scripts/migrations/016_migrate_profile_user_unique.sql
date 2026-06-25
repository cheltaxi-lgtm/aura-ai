-- One profile per account: prevent cross-cabinet data leaks
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_profile_user_id_unique
  ON user_accounts (profile_user_id)
  WHERE profile_user_id IS NOT NULL;

-- Detach duplicate profile links (keep the oldest account per profile)
WITH ranked AS (
  SELECT
    id,
    profile_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_user_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM user_accounts
  WHERE profile_user_id IS NOT NULL
)
UPDATE user_accounts ua
SET profile_user_id = NULL
FROM ranked r
WHERE ua.id = r.id
  AND r.rn > 1;
