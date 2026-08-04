-- Rollback for 098_migrate_hd_center_insights.sql.
BEGIN;

DROP TABLE IF EXISTS hd_center_insights;

COMMIT;
