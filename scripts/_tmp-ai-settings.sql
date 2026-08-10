SELECT key, left(value::text, 600) AS val FROM platform_settings WHERE key = 'ai';

SELECT id, status, attempt_count, generation_ms, updated_at,
       left(coalesce(error_message, ''), 200) AS err
FROM async_jobs
WHERE id = '2ea2e121-cd25-4795-aeab-a8f045da4b1c';
