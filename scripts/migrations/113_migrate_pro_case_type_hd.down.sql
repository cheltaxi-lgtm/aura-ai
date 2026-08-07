-- Revert HD case type. Cases with type='hd' must be archived/deleted first.

ALTER TABLE pro.cases DROP CONSTRAINT IF EXISTS cases_type_check;

ALTER TABLE pro.cases
  ADD CONSTRAINT cases_type_check CHECK (type IN (
    'manual_spread', 'photo_spread', 'custom_layout',
    'natal', 'forecast', 'synastry', 'matrix',
    'numerology', 'runes', 'lenormand'
  ));
