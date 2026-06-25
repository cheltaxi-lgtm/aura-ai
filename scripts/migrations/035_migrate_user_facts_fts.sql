-- Lexical (keyword) index for hybrid retrieval: fuse vector similarity with
-- Russian full-text ranking so sharp keyword queries (names, places, project
-- names) surface even when embeddings miss them. Matches Mem0 v3 hybrid search.
CREATE INDEX IF NOT EXISTS idx_user_facts_fts
  ON user_facts USING gin (to_tsvector('russian', fact));
