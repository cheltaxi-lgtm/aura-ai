/**
 * Fix broken LLM markdown in spread readings — empty * *, orphan asterisks.
 */

/** Extract card/rune names from leading ![Name](url) image block. */
export function cardNamesFromImageMarkdown(text: string): string[] {
  const names: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^!\[([^\]]+)\]\(/);
    if (!m) break;
    const name = m[1]?.trim();
    if (name) names.push(name);
  }
  return names.slice(0, 3);
}

/** Card names from image block and/or **Name** markers in the reading body. */
export function inferSpreadCardNames(text: string): string[] {
  const fromImages = cardNamesFromImageMarkdown(text);
  if (fromImages.length >= 3) return fromImages;

  const fromBold: string[] = [];
  for (const m of text.matchAll(/\*\*([^*]{2,40})\*\*/gu)) {
    const n = m[1].trim();
    if (/^(?:ваш расклад|простыми словами|утро|день|вечер)$/iu.test(n)) continue;
    if (!fromBold.some((x) => x.toLowerCase() === n.toLowerCase())) fromBold.push(n);
  }
  return fromBold.slice(0, 3);
}

/** Replace empty emphasis / orphan stars; optionally inject spread card names. */
export function polishSpreadReadingText(text: string, cardNames?: string[]): string {
  let out = text.replace(/\r\n/g, "\n");
  const cards = (cardNames ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  let cardIdx = 0;

  const nextCard = (): string => {
    if (cardIdx < cards.length) return `**${cards[cardIdx++]}**`;
    return "";
  };

  // Empty emphasis placeholders → real card names (must run before orphan stripping).
  out = out.replace(/\*\s+\*/g, nextCard);
  out = out.replace(/\*\*(?:\s|\u00a0)+\*\*/g, nextCard);

  // Leftover empty emphasis only — keep valid **Name** pairs intact.
  out = out.replace(/\*\s+\*/g, "");
  out = out.replace(/\*\*(?:\s|\u00a0)*\*\*/g, "");

  return out.replace(/  +/g, " ").trim();
}
