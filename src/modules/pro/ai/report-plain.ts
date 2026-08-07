/**
 * Pro client-facing report text: plain premium prose, no markdown chrome.
 */

/** Strip **, #, ### and similar so /r and PDF look like a finished product. */
export function polishProReportPlainText(text: string): string {
  let t = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!t) return "";

  // Headings → plain title lines (keep the words, drop hashes).
  t = t.replace(/^#{1,6}\s+/gm, "");

  // Paired emphasis.
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");

  // Orphan markdown noise.
  t = t.replace(/\*\*/g, "");
  t = t.replace(/(^|\s)\*(?=\s|$)/gm, "$1");
  t = t.replace(/^\s*[\u2022·]\s+/gm, "— ");
  t = t.replace(/^\s*\*\s+/gm, "— ");

  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

export function polishProReportTitle(title: string): string {
  return polishProReportPlainText(title)
    .replace(/\n+/g, " ")
    .trim();
}
