-- Hash any remaining plaintext 48-hex claim_token values (pre-hashing era).
-- App hashes with SHA-256 over `hd-claim:v1:${raw}` (Node createHash).
-- After this, claim routes match hash-only (no dual-read of raw tokens).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE hd_charts
SET claim_token = encode(digest('hd-claim:v1:' || claim_token, 'sha256'), 'hex'),
    updated_at = now()
WHERE claim_token IS NOT NULL
  AND claim_token ~ '^[0-9a-f]{48}$';
