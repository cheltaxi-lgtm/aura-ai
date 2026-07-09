-- Expand obryady catalog: add 'health' and 'career' ritual types (2026-07 audit).

ALTER TABLE rituals DROP CONSTRAINT IF EXISTS rituals_ritual_type_check;

ALTER TABLE rituals ADD CONSTRAINT rituals_ritual_type_check
  CHECK (ritual_type IN ('love','money','protection','luck','release','health','career'));
