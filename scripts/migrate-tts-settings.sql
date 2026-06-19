-- TTS settings for admin panel (OpenRouter speech models)
INSERT INTO platform_settings (key, value) VALUES
  ('tts', '{"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":3200}')
ON CONFLICT (key) DO NOTHING;
