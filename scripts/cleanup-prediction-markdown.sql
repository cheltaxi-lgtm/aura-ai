-- One-off cleanup: strip markdown card images from stored session previews.
-- New writes are cleaned in code (session-memory.ts); this fixes historical rows.
\set img_re '!\\[[^\\]]*\\]\\([^)]*\\)'

SELECT COUNT(*) AS dirty_before FROM session_memories WHERE prediction ~ :'img_re';

UPDATE session_memories
SET prediction = btrim(
      regexp_replace(
        regexp_replace(prediction, :'img_re', ' ', 'g'),
        '[ \t]{2,}', ' ', 'g'
      )
    )
WHERE prediction ~ :'img_re';

UPDATE session_memories
SET topic_summary = btrim(
      regexp_replace(
        regexp_replace(topic_summary, :'img_re', ' ', 'g'),
        '[ \t]{2,}', ' ', 'g'
      )
    )
WHERE topic_summary ~ :'img_re';

SELECT COUNT(*) AS dirty_after FROM session_memories WHERE prediction ~ :'img_re';
