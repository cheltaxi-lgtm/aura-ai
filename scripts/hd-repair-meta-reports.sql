-- One-off repair: paid HD reports whose saved text contains LLM meta-commentary
-- ("готов продолжить по вашему запросу" etc.) instead of real sections.
-- Marks them pending+stale so the next client visit RESUMES generation on the
-- SAME charge (no double spend) — see error+tx resume barrier in the routes.
-- Safe to re-run: only matches done rows that still contain the leak.

BEGIN;

WITH bad AS (
  SELECT id FROM hd_reports
  WHERE status = 'done'
    AND transaction_id IS NOT NULL
    AND report_text ~* '(готов\s+продолжить|по\s+вашему\s+запросу|по\s+тому\s+же\s+принципу|оставшиеся\s+разделы|продолжение\s+следует|остальные.{0,12}разделы.{0,20}пишутся)'
)
UPDATE hd_reports r
SET status = 'pending',
    error = NULL,
    created_at = now() - make_interval(secs => 601),
    updated_at = now()
FROM bad
WHERE r.id = bad.id;

WITH bad AS (
  SELECT id FROM hd_composite_reports
  WHERE status = 'done'
    AND transaction_id IS NOT NULL
    AND report_text ~* '(готов\s+продолжить|по\s+вашему\s+запросу|по\s+тому\s+же\s+принципу|оставшиеся\s+разделы|продолжение\s+следует|остальные.{0,12}разделы.{0,20}пишутся)'
)
UPDATE hd_composite_reports r
SET status = 'pending',
    error = NULL,
    created_at = now() - make_interval(secs => 601),
    updated_at = now()
FROM bad
WHERE r.id = bad.id;

COMMIT;
