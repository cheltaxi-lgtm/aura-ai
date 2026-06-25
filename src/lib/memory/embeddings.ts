/**
 * Embeddings for the long-term memory pipeline, served by OpenRouter.
 *
 * Model: baai/bge-m3 (1024-dim, multilingual) — the same model family we used
 * locally, so previously stored vectors remain compatible (no re-embedding).
 * Best-effort: any failure returns null so callers degrade gracefully (store
 * without a vector / fall back to lexical + salience).
 */
import { openRouterAppHeaders } from "@/lib/brand";

const OPENROUTER_EMBED_API = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_EMBED_MODEL = "baai/bge-m3";

/** bge-m3 produces 1024-dimensional vectors. Must match the pgvector column. */
export const EMBED_DIM = 1024;

export function embedModel(): string {
  return process.env.MEMORY_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function isConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return !!key && !key.startsWith("sk-your") && !key.startsWith("your-");
}

interface EmbeddingItem {
  embedding?: number[];
  index?: number;
}

/**
 * Embed one or more strings. Returns one vector per input (input order
 * preserved), or null on any failure.
 */
export async function embedTexts(
  input: string | string[],
  timeoutMs = 15000
): Promise<number[][] | null> {
  if (!isConfigured()) return null;
  const items = (Array.isArray(input) ? input : [input]).map((t) => String(t).slice(0, 4000));
  if (items.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_EMBED_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        ...openRouterAppHeaders(),
      },
      body: JSON.stringify({ model: embedModel(), input: items }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[embed] HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { data?: EmbeddingItem[] };
    const rows = data?.data;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Order by `index` so batch results line up with the input array.
    const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const vectors = ordered.map((r) => r.embedding).filter((v): v is number[] => Array.isArray(v));
    if (vectors.length === 0) return null;
    if (!vectors.every((v) => v.length === EMBED_DIM)) {
      console.warn(`[embed] unexpected dimension (expected ${EMBED_DIM})`);
      return null;
    }
    return vectors;
  } catch (err) {
    console.warn("[embed] failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
