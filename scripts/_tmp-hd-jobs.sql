SELECT id, kind, status, attempt_count, created_at, updated_at, locked_at, worker_id,
       left(coalesce(error_message, ''), 140) AS err
FROM async_jobs
WHERE kind IN ('hd_report', 'hd_composite_report', 'natal_forecast', 'natal_interpretation')
  AND status IN ('pending', 'running', 'needs_regeneration')
ORDER BY updated_at DESC
LIMIT 20;

SELECT status, count(*)
FROM async_jobs
WHERE kind IN ('hd_report', 'natal_forecast')
GROUP BY status;
