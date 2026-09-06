-- Durable marker separating paid admin rewrites from rejected QA drafts.
ALTER TABLE hd_reports
  ADD COLUMN IF NOT EXISTS admin_rewrite_started_at TIMESTAMPTZ;
