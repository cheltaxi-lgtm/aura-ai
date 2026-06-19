-- Global TTS on/off switch (default: disabled)
UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || '{"enabled":false}'::jsonb
WHERE key = 'tts';

INSERT INTO platform_settings (key, value) VALUES
  ('tts', '{"enabled":false,"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":4000}')
ON CONFLICT (key) DO UPDATE
SET value = platform_settings.value || '{"enabled":false}'::jsonb;
