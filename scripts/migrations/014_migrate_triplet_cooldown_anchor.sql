-- Backfill lastTripletDrawAt from existing triplet history rows
UPDATE users u
SET astro_meta = jsonb_set(
  COALESCE(astro_meta, '{}'::jsonb),
  '{lastTripletDrawAt}',
  to_jsonb(h.max_at::text),
  true
)
FROM (
  SELECT user_id, MAX(created_at) AS max_at
  FROM history
  WHERE character_name = 'triplet'
     OR context_data->>'type' = 'triplet'
  GROUP BY user_id
) h
WHERE u.id = h.user_id
  AND (
    astro_meta->>'lastTripletDrawAt' IS NULL
    OR (astro_meta->>'lastTripletDrawAt')::timestamptz < h.max_at
  );
