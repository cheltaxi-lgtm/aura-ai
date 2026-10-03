// Consume full words/parentheses before abbreviations; do not eat a prefix of
// «перевёрнутая» or match an unrelated word such as «перевод».
const MARKER = String.raw`(?:перев[её]рнут(?:ая|ый|ое|ые)?|перев\.?|reversed|rev\.?|upside[- ]?down)`;
const REVERSED_MARKERS = new RegExp(String.raw`(?:\(\s*${MARKER}\s*\)|(?<![\p{L}\p{N}])${MARKER}(?![\p{L}\p{N}]))`, "giu");

export function parseCardOrientation(raw: string): { name: string; reversed: boolean } {
  let text = raw.replace(/[«»"']/g, "").trim();
  const reversed = Boolean(text.match(REVERSED_MARKERS));
  text = text
    .replace(REVERSED_MARKERS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name: text, reversed };
}

export function formatReversedCardName(name: string, reversed: boolean): string {
  return reversed ? `${name} (перев.)` : name;
}
