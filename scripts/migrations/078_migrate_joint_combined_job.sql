-- Durable worker kind for joint combined AI synthesis.

ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_kind_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_kind_check
  CHECK (kind IN (
    'reading',
    'image_generate',
    'natal_interpretation',
    'natal_forecast',
    'natal_compatibility',
    'intention_spread',
    'daily_reading',
    'daily_extended',
    'joint_reading',
    'joint_combined',
    'photo_reading',
    'ritual_generation',
    'numerology_reading'
  ));
