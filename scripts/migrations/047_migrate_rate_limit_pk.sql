-- Ensure rate_limit_buckets supports ON CONFLICT (bucket_key) upserts.
DELETE FROM rate_limit_buckets a
USING rate_limit_buckets b
WHERE a.ctid < b.ctid
  AND a.bucket_key = b.bucket_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'rate_limit_buckets'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE rate_limit_buckets ADD PRIMARY KEY (bucket_key);
  END IF;
END $$;
