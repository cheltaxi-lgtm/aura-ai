-- Reset triplet cooldown for user Геннадий
BEGIN;

UPDATE users
SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) - 'lastTripletDrawAt'
WHERE name ILIKE '%геннад%'
   OR name ILIKE '%gennad%'
   OR id IN (
     SELECT profile_user_id FROM user_accounts
     WHERE name ILIKE '%геннад%' OR name ILIKE '%gennad%'
        OR email ILIKE '%gennad%' OR email ILIKE '%gennady%'
   );

DELETE FROM history h
WHERE (h.character_name = 'triplet' OR h.context_data->>'type' = 'triplet')
  AND h.user_id IN (
    SELECT u.id FROM users u
    LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
    WHERE u.name ILIKE '%геннад%'
       OR u.name ILIKE '%gennad%'
       OR ua.name ILIKE '%геннад%'
       OR ua.name ILIKE '%gennad%'
       OR ua.email ILIKE '%gennad%'
       OR ua.email ILIKE '%gennady%'
  );

COMMIT;

SELECT u.id, u.name, ua.email, u.astro_meta->>'lastTripletDrawAt' AS anchor
FROM users u
LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
WHERE u.name ILIKE '%геннад%'
   OR u.name ILIKE '%gennad%'
   OR ua.name ILIKE '%геннад%'
   OR ua.email ILIKE '%gennad%';
