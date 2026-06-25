const REVERSED_MARKERS =
  /\(перев\.?\)|\(reversed\)|\(rev\.?\)|перев\.?|перевернутая|перевёрнутая|reversed|upside[- ]?down/i;

export function parseCardOrientation(raw: string): { name: string; reversed: boolean } {
  let text = raw.replace(/[«»"']/g, "").trim();
  const reversed = REVERSED_MARKERS.test(text);
  text = text
    .replace(REVERSED_MARKERS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name: text, reversed };
}

export function formatReversedCardName(name: string, reversed: boolean): string {
  return reversed ? `${name} (перев.)` : name;
}
