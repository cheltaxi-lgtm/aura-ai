/** Client-safe helpers — no server/LLM imports. */

/** Avoid showing mid-word LLM cutoffs when the provider hits max_tokens. */
export function trimIncompleteTrailingSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?…»"')\]]$/.test(t)) return t;

  const lastEnd = Math.max(
    t.lastIndexOf(". "),
    t.lastIndexOf("! "),
    t.lastIndexOf("? "),
    t.lastIndexOf("… ")
  );
  if (lastEnd >= Math.floor(t.length * 0.45)) {
    return t.slice(0, lastEnd + 1).trim();
  }
  return t;
}

export function isProseLikelyTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 48) return false;
  if (/[.!?…»"')\]]$/.test(t)) return false;
  return true;
}
