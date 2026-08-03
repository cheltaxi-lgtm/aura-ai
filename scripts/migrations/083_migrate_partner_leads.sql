-- Partnership inbound leads (separate from support tickets).

CREATE TABLE IF NOT EXISTS partner_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  website TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_leads_status_check
    CHECK (status IN ('new', 'in_progress', 'done', 'spam'))
);

CREATE INDEX IF NOT EXISTS idx_partner_leads_created
  ON partner_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_leads_status_created
  ON partner_leads (status, created_at DESC);
