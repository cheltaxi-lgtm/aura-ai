-- Sync free chat model with paid when paid is DeepSeek V3 (one-time helper)
UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(value, '{freeModel}', COALESCE(value->'paidModel', value->'model')),
    '{model}',
    COALESCE(value->'paidModel', value->'model')
  ),
  '{provider}',
  '"openrouter"'
)
WHERE key = 'ai'
  AND value->>'paidModel' LIKE 'deepseek/deepseek-chat-v3%';
