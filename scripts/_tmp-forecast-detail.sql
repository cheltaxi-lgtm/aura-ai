\x on
SELECT id, status, created_at, started_at, completed_at,
       generation_ms, llm_calls,
       left(input::text, 300) AS input_preview,
       left(result::text, 400) AS result_preview
FROM async_jobs
WHERE id = 'b115fe37-47d6-47bb-912b-37c5072e1a49';
