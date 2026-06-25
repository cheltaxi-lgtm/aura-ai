-- Reset triplet cooldown for Gennady (testing)
UPDATE users
SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) - 'lastTripletDrawAt'
WHERE name ILIKE '%геннад%'
   OR id IN (
     SELECT profile_user_id FROM user_accounts
     WHERE email ILIKE '%gamer_club%'
   );
