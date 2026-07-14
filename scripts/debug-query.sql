\pset border 2
\x on
SELECT id, user_id, character_key, reading_date, deck_system, cards, LEFT(reading_text, 300) AS reading_text
FROM daily_readings
WHERE reading_date = CURRENT_DATE
ORDER BY reading_date DESC
LIMIT 2;
