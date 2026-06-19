-- Admin panel migration (run on existing DB)
CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admin_accounts(id)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_accounts(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

INSERT INTO platform_settings (key, value) VALUES
  ('ai', '{"provider":"openrouter","model":"openai/gpt-4o-mini","visionModel":"openai/gpt-4o","temperature":0.85,"maxTokens":800,"maxReadingTokens":900}'),
  ('pricing', '{"singlePrice":199,"subscriptionPrice":590,"currency":"RUB"}'),
  ('features', '{"maintenanceMode":false,"registrationEnabled":true,"recaptchaEnabled":false,"freeQuestionLimit":2,"demoPayments":true}'),
  ('prompts', '{"globalPrefix":"Ты — мастер эзотерической платформы Aura. Отвечай на русском."}'),
  ('tts', '{"enabled":false,"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":4000}'),
  ('visual', '{"enabled":true,"model":"bytedance-seed/seedream-4.5","fallbackModel":"google/gemini-3.1-flash-image-preview","fallbackEnabled":true,"defaultQuality":"standard","stylePrefix":"Aura mystical esoteric platform, cinematic lighting, rich colors, highly detailed digital art, no watermark, no UI elements","scenes":{"zodiac_avatar":true,"tarot_atmosphere":true,"destiny_card":true,"scene_illustration":true,"final_report":true}}')
ON CONFLICT (key) DO NOTHING;

UPDATE platform_settings SET value = '{"globalPrefix":"Ты — мастер эзотерической платформы Aura. Отвечай на русском."}'::jsonb
WHERE key = 'prompts';
