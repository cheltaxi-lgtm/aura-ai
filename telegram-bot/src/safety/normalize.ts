/** Homoglyph map: common Latin lookalikes → Cyrillic. */
const HOMOGLYPHS: Record<string, string> = {
  a: "а",
  e: "е",
  o: "о",
  p: "р",
  c: "с",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  h: "н",
  b: "в",
  t: "т",
};

/**
 * Normalize free text before safety matching.
 * Lowercase, ё→е, collapse letter repeats, strip punct/spaces obfuscation, homoglyphs.
 */
export function normalizeSafetyText(raw: string): string {
  let s = raw.toLowerCase().replace(/ё/g, "е");
  s = [...s].map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
  s = s.replace(/[^\p{L}\p{N}]+/gu, "");
  // Collapse any repeated letter run to a single letter for stem matching
  s = s.replace(/(.)\1+/gu, "$1");
  return s;
}
