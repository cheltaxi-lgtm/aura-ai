/**
 * Ensure extracted facts are grounded in the client's own message text.
 */

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppearsInSource(source: string, quote: string): boolean {
  const s = normalizeForMatch(source);
  const q = normalizeForMatch(quote);
  if (!s || !q || q.length < 6) return false;
  if (s.includes(q)) return true;
  // Loose match: tokens in order with a tight gap (not scattered across the message).
  const qTokens = q.split(" ").filter((t) => t.length >= 3);
  if (qTokens.length < 2) return false;
  let from = 0;
  for (const token of qTokens) {
    const idx = s.indexOf(token, from);
    if (idx < 0) return false;
    if (idx - from > 24) return false;
    from = idx + token.length;
  }
  return true;
}

export function filterGroundedFacts<T extends { fact: string; evidenceQuote?: string | null }>(
  userMessage: string,
  facts: T[]
): T[] {
  return facts.filter((f) => {
    const quote = (f.evidenceQuote ?? "").trim();
    if (!quote) return false;
    return quoteAppearsInSource(userMessage, quote);
  });
}
