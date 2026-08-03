/** Phrase normalization for keyword semantics pipeline. */

export function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}
