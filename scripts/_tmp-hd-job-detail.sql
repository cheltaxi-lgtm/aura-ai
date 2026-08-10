SELECT id, status, attempt_count, created_at, started_at, updated_at,
       generation_ms, llm_calls,
       left(coalesce(error_message, ''), 200) AS err
FROM async_jobs
WHERE id = '2ea2e121-cd25-4795-aeab-a8f045da4b1c';

SELECT id, status, generation_ms, llm_calls, created_at, completed_at,
       left(coalesce(error_message, ''), 120) AS err
FROM async_jobs
WHERE kind = 'hd_report'
ORDER BY created_at DESC
LIMIT 12;
