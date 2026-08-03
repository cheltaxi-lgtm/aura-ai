-- Planetary longitudes are essential sanitized wheel data. The former
-- recursive longitude ban rejected every manual synastry snapshot before it
-- could be saved. Birth-place latitude/timezone and all raw birth fields
-- remain prohibited.
ALTER TABLE natal_compatibility_reports
  DROP CONSTRAINT IF EXISTS natal_compatibility_snapshot_private;

ALTER TABLE natal_compatibility_reports
  ADD CONSTRAINT natal_compatibility_snapshot_private CHECK (
    synastry_snapshot IS NULL OR NOT (
      jsonb_path_exists(synastry_snapshot, '$.**.birthDate') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthTime') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthCity') OR
      jsonb_path_exists(synastry_snapshot, '$.**.latitude') OR
      jsonb_path_exists(synastry_snapshot, '$.**.timezone')
    )
  );
