-- Backfill sessions.character_key from session_memories for rows missing master binding.
-- Safe to run multiple times. Does not change schema.

UPDATE sessions s
SET
  character_key = sm.character_key,
  updated_at = NOW()
FROM session_memories sm
WHERE sm.session_id = s.id
  AND sm.user_id = s.user_id
  AND sm.character_key IS NOT NULL
  AND TRIM(sm.character_key) <> ''
  AND (s.character_key IS NULL OR TRIM(s.character_key) = '');

-- Prefer cards from session_memories when sessions.cards is empty
UPDATE sessions s
SET
  cards = to_jsonb(sm.key_cards),
  updated_at = NOW()
FROM session_memories sm
WHERE sm.session_id = s.id
  AND sm.user_id = s.user_id
  AND sm.key_cards IS NOT NULL
  AND cardinality(sm.key_cards) > 0
  AND (s.cards IS NULL OR s.cards = 'null'::jsonb OR s.cards = '[]'::jsonb);
