-- SQLite cannot drop columns portably; down marks migration reverted only.
-- Data columns remain (safe additive rollback for tracking).
SELECT 1;
