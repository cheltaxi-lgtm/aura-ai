SELECT 'charts' AS t, count(*) FROM hd_charts
UNION ALL SELECT 'reports', count(*) FROM hd_reports
UNION ALL SELECT 'composite_reports', count(*) FROM hd_composite_reports;
SELECT subject_kind, count(*) FROM hd_charts GROUP BY 1;
SELECT count(DISTINCT user_id) AS users, count(DISTINCT fingerprint) AS uniq_fp FROM hd_charts;
SELECT indexname FROM pg_indexes WHERE tablename LIKE 'hd\_%' ORDER BY 1;
SELECT date_trunc('day', created_at) AS day, count(*) FROM hd_charts GROUP BY 1 ORDER BY 1 DESC LIMIT 7;
SELECT status, count(*) FROM hd_composite_reports GROUP BY 1;
