/**
 * Fix broken LLM markdown in spread readings — empty * *, orphan asterisks.
 */

const DEFAULT_MAX_CARDS = 10;

/** Markdown image — URL may be empty when the model emits broken `![Name]()`. */
export const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
export const MARKDOWN_IMAGE_LINE_PATTERN = /^(?:!\[[^\]]*\]\([^)]*\)\s*)+$/;

const CARD_IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/;

/** Remove all markdown card/rune images (header row already shows the spread). */
export function stripAllSpreadCardImages(content: string): string {
  return content
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(/^[ \t]*\n/gm, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove leading markdown card images (used when the spread row already shows cards). */
export function stripLeadingSpreadCardImages(content: string): string {
  const lines = content.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    if (CARD_IMAGE_LINE_RE.test(line)) {
      index += 1;
      continue;
    }
    break;
  }

  return lines.slice(index).join("\n").trim();
}

/** Extract card/rune names from leading ![Name](url) image block. */
export function cardNamesFromImageMarkdown(text: string, maxCards = DEFAULT_MAX_CARDS): string[] {
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
  return names.slice(0, maxCards);
}

/** Card names from image block and/or **Name** markers in the reading body. */
export function inferSpreadCardNames(text: string, cardNames?: string[]): string[] {
  const limit = cardNames?.length ?? DEFAULT_MAX_CARDS;
  const fromImages = cardNamesFromImageMarkdown(text, limit);
  if (cardNames?.length && fromImages.length >= cardNames.length) {
    return fromImages.slice(0, limit);
  }
  if (fromImages.length >= Math.min(3, limit)) return fromImages;

  const fromBold: string[] = [];
  for (const m of text.matchAll(/\*\*([^*]{2,40})\*\*/gu)) {
    const n = m[1].trim();
    if (/^(?:ваш расклад|простыми словами|утро|день|вечер)$/iu.test(n)) continue;
    if (!fromBold.some((x) => x.toLowerCase() === n.toLowerCase())) fromBold.push(n);
  }
  return fromBold.slice(0, limit);
}

/** Replace empty emphasis / orphan stars; optionally inject spread card names. */
export function polishSpreadReadingText(text: string, cardNames?: string[]): string {
  let out = text.replace(/\r\n/g, "\n");
  const cards = (cardNames ?? []).map((c) => c.trim()).filter(Boolean);
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
