-- Allow Human Design as a Pro case type (premium report funnel).

ALTER TABLE pro.cases DROP CONSTRAINT IF EXISTS cases_type_check;

ALTER TABLE pro.cases
  ADD CONSTRAINT cases_type_check CHECK (type IN (
    'manual_spread', 'photo_spread', 'custom_layout',
    'natal', 'forecast', 'synastry', 'matrix',
    'numerology', 'runes', 'lenormand', 'hd'
  ));
