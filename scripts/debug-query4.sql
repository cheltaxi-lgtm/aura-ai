\pset border 2
\x on
SELECT reading_text FROM daily_readings WHERE user_id = '2383df09-bb04-444d-9672-b9f3afd8c34c' AND reading_date = CURRENT_DATE;
SELECT role, content, created_at FROM chat_messages WHERE session_id = '06c3190c-d928-4e23-a36a-23fd91f88b60' ORDER BY created_at ASC;
