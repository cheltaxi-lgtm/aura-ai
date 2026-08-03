-- Fix: 002 skipped first ALTER because leading SQL comment was glued to the statement.
ALTER TABLE bot_users ADD COLUMN timezone_offset_minutes INTEGER;
