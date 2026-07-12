SELECT column_name
FROM information_schema.columns
WHERE table_name = 'user_accounts'
  AND column_name IN (
    'terms_accepted_at',
    'age_confirmed_at',
    'marketing_consent',
    'marketing_consent_at'
  )
ORDER BY 1;
