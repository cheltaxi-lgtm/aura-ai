-- Durable cross-master client facts with vector embeddings (replaces Mem0).
-- Requires the pgvector extension (image: pgvector/pgvector:pg16).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS user_facts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact             TEXT NOT NULL,
  category         TEXT,
  event_date       DATE,
  source_character TEXT,
  salience         SMALLINT NOT NULL DEFAULT 3,
  embedding        vector(1024),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_facts_user
  ON user_facts (user_id, salience DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_facts_embedding
  ON user_facts USING hnsw (embedding vector_cosine_ops);
