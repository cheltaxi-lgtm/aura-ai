/**
 * Embeddings-based semantic upgrade of isTextRelevantToQuery, split into its
 * own server-only module deliberately: memory-relevance.ts may be reachable
 * from client bundles (via @/lib/prompts) and must stay free of Node-only
 * deps like "@/lib/memory/embeddings" (which pulls in undici). Only
 * server-side callers (user-memory.ts, API routes) import this.
 */
import { isTextRelevantToQuery } from "@/lib/memory/memory-relevance";
import { embedTexts } from "@/lib/memory/embeddings";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/** Cosine similarity above which two texts are considered semantically related (bge-m3). */
const SEMANTIC_RELEVANCE_MIN_SIM = 0.5;
/** Keep the embedding round-trip snappy — this sits in the hot prompt-building path. */
const SEMANTIC_RELEVANCE_TIMEOUT_MS = 1800;

/**
 * Semantic upgrade of isTextRelevantToQuery for the handful of candidates in
 * session-memory blocks (past sessions / current-session anchor). Those were
 * gated by lexical token overlap only — unlike `user_facts`, which already has
 * hybrid vector+FTS search. A paraphrase ("расстаёмся" vs "развод") could pass
 * the relevance gate for long-term facts but silently miss it here. Batches all
 * candidates that fail the lexical check into a single embeddings call and
 * degrades to the plain lexical result if embeddings are slow/unavailable —
 * never throws, never blocks longer than the timeout.
 */
export async function isTextRelevantToQueryAsync(
  query: string,
  candidates: string[]
): Promise<boolean[]> {
  const lexical = candidates.map((c) => isTextRelevantToQuery(query, c));
  const q = query.trim();
  if (!q || !candidates.length || lexical.every(Boolean)) return lexical;

  const pending = candidates
    .map((c, i) => ({ i, text: c.trim() }))
    .filter(({ i, text }) => !lexical[i] && text.length > 0);
  if (!pending.length) return lexical;

  try {
    const vectors = await embedTexts(
      [q, ...pending.map((p) => p.text)],
      SEMANTIC_RELEVANCE_TIMEOUT_MS
    );
    if (!vectors || vectors.length !== pending.length + 1) return lexical;

    const [queryVec, ...candidateVecs] = vectors;
    const result = [...lexical];
    pending.forEach(({ i }, k) => {
      if (cosineSimilarity(queryVec, candidateVecs[k]) >= SEMANTIC_RELEVANCE_MIN_SIM) {
        result[i] = true;
      }
    });
    return result;
  } catch {
    return lexical;
  }
}
