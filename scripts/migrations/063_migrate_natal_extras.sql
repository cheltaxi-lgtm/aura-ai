-- Joint reading synastry payload + natal transit notify dedup.
ALTER TABLE joint_readings
  ADD COLUMN IF NOT EXISTS synastry_data jsonb;

ALTER TABLE natal_charts
  ADD COLUMN IF NOT EXISTS last_transit_notify_at timestamptz;
