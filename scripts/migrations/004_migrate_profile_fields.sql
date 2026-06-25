-- Extended astro profile fields on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_time TIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS life_focus TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS main_question TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS astro_meta JSONB NOT NULL DEFAULT '{}';
