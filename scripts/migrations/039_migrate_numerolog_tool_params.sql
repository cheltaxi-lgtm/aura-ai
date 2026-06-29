ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS numerolog_tool_params JSONB;
